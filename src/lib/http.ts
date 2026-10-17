import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import type { Identity } from "./auth/verify-identity";
import { verifyIdentity } from "./auth/verify-identity";
import { ApiError, badRequest, forbidden } from "./api-error";
import { assertSafeJson, readBoundedBody } from "./body";
import { assertProductionConfiguration } from "./security/config";
import { enforceIpLimit, enforceUserLimit, type RatePolicy } from "./security/rate-limit";

interface HandlerContext {
  identity: Identity;
  request: Request;
  requestId: string;
}

interface PublicHandlerContext {
  request: Request;
  requestId: string;
}

type Handler = (context: HandlerContext) => Promise<Response>;
type PublicHandler = (context: PublicHandlerContext) => Promise<Response>;

function requestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)) return incoming;
  return randomUUID();
}

function corsHeaders(request: Request) {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.APP_ORIGIN;

  if (origin && allowedOrigin && origin === allowedOrigin) {
    headers.set("access-control-allow-origin", origin);
  }
  headers.set("vary", "Origin");

  return headers;
}

function finalizeResponse(request: Request, response: Response, id: string) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request);

  for (const [key, value] of cors) headers.set(key, value);
  headers.set("x-request-id", id);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "private, no-store");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function errorResponse(request: Request, error: unknown, id: string) {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = badRequest(
      "VALIDATION_ERROR",
      "The request does not match the API contract",
      error.issues.slice(0, 20).map((issue) => ({
        code: issue.code,
        message: issue.code === "unrecognized_keys" ? "Unknown fields are not allowed" : issue.message,
        path: issue.path.join("."),
      })),
    );
  } else {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? Reflect.get(error, "code")
        : undefined;
    console.error("Unhandled API error", { requestId: id, errorName, errorCode });
    apiError = new ApiError(500, "INTERNAL_ERROR", "An internal error occurred");
  }

  const retry = apiError.details && typeof apiError.details === "object" && "retryAfterSeconds" in apiError.details
    ? Number(apiError.details.retryAfterSeconds) : 60;
  const retryAfter = Number.isInteger(retry) && retry >= 1 && retry <= 3600 ? retry : 60;
  return finalizeResponse(
    request,
    Response.json(
      {
        error: {
          code: apiError.code,
          message: apiError.message,
          ...(apiError.details === undefined ? {} : { details: apiError.details }),
        },
        requestId: id,
      },
      { status: apiError.status, headers: apiError.status === 429 ? { "retry-after": String(retryAfter) } : undefined },
    ),
    id,
  );
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const allowedOrigin = process.env.APP_ORIGIN;
  if (!allowedOrigin || origin !== allowedOrigin) {
    throw forbidden("ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
  }
}

export function privateHandler(handler: Handler, policy?: RatePolicy) {
  return async (request: Request) => {
    const id = requestId(request);

    try {
      assertProductionConfiguration();
      await enforceIpLimit(request);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        validateOrigin(request);
      }
      const identity = await verifyIdentity(request);
      await enforceUserLimit(request, identity.internalUserId, policy);
      const response = await handler({ identity, request, requestId: id });
      response.headers.set("cache-control", "private, no-store");
      return finalizeResponse(request, response, id);
    } catch (error) {
      return errorResponse(request, error, id);
    }
  };
}

export function publicHandler(handler: PublicHandler) {
  return async (request: Request) => {
    const id = requestId(request);

    try {
      assertProductionConfiguration();
      await enforceIpLimit(request);
      return finalizeResponse(request, await handler({ request, requestId: id }), id);
    } catch (error) {
      return errorResponse(request, error, id);
    }
  };
}

export function optionsHandler(methods: string[]) {
  return publicHandler(async () => {
    const headers = new Headers({
      "access-control-allow-headers": "Authorization, Content-Type, X-Request-ID",
      "access-control-allow-methods": [...methods, "OPTIONS"].join(", "),
      "access-control-max-age": "600",
    });
    return new Response(null, { headers, status: 204 });
  });
}

export async function readJson(request: Request, maxBytes = 1_048_576) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.split(";", 1)[0].trim() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }

  const bytes = await readBoundedBody(request, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw badRequest("INVALID_JSON", "The request body is not valid JSON");
  }
  assertSafeJson(parsed, maxBytes);
  return parsed;
}

export function apiJson(data: unknown, init?: ResponseInit) {
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > 3 * 1024 * 1024) throw new ApiError(413, "RESPONSE_TOO_LARGE", "The response exceeds the supported size; use a smaller page");
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(body, { ...init, headers });
}
