import { badRequest } from "./api-error";

export function queryParameters(url: string) {
  const input: Record<string, string> = {};
  const params = new URL(url).searchParams;
  if ([...params].length > 20 || url.length > 8192) throw badRequest("VALIDATION_ERROR", "Too many query parameters");
  for (const [key, value] of params) {
    if (["__proto__", "constructor", "prototype"].includes(key) || Object.hasOwn(input, key)) throw badRequest("VALIDATION_ERROR", "Duplicate or reserved query parameter");
    Object.defineProperty(input, key, { value, enumerable: true });
  }
  return input;
}
