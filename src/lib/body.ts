import { ApiError, badRequest } from "./api-error";

export async function readBoundedBody(request: Request, maxBytes: number, timeoutMs = 20000): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d{1,16}$/.test(length) || Number(length) > maxBytes)) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large");
  }
  if (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity") {
    throw new ApiError(415, "UNSUPPORTED_ENCODING", "Compressed request bodies are not supported");
  }
  if (!request.body) throw badRequest("EMPTY_BODY", "A request body is required");
  if (request.signal.aborted) throw new ApiError(408, "BODY_TIMEOUT", "The upload was interrupted");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => {
      reject(new ApiError(408, "BODY_TIMEOUT", "The upload timed out or was interrupted"));
      void reader.cancel().catch(() => {});
    };
    timer = setTimeout(abort, timeoutMs);
    request.signal.addEventListener("abort", abort, { once: true });
  });
  try {
    while (true) {
      const item = await Promise.race([reader.read(), interrupted]);
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large");
      }
      chunks.push(item.value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badRequest("INVALID_BODY", "The request body could not be read");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export function assertSafeJson(value: unknown, maxBytes = 65536) {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > 20000 || current.depth > 32) throw badRequest("JSON_COMPLEXITY_LIMIT", "The JSON structure is too complex");
    if (typeof current.value === "string" && current.value.includes("\0")) throw badRequest("INVALID_JSON_VALUE", "Null characters are not supported");
    if (typeof current.value === "number" && !Number.isFinite(current.value)) throw badRequest("INVALID_JSON_VALUE", "Numbers must be finite");
    if (current.value && typeof current.value === "object") {
      for (const [key, child] of Object.entries(current.value)) {
        if (["__proto__", "constructor", "prototype"].includes(key) || key.includes("\0")) throw badRequest("INVALID_JSON_KEY", "Reserved JSON keys are not supported");
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  if (Buffer.byteLength(JSON.stringify(value) ?? "null") > maxBytes) throw new ApiError(413, "JSON_SIZE_LIMIT", "The JSON value is too large");
}
