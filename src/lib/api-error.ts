export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(code: string, message: string, details?: unknown) {
  return new ApiError(400, code, message, details);
}

export function unauthorized(message = "Authentication is required") {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(code: string, message: string) {
  return new ApiError(403, code, message);
}

export function conflict(code: string, message: string, details?: unknown) {
  return new ApiError(409, code, message, details);
}
