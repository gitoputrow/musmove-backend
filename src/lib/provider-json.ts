// Provider replies are untrusted input too; do not buffer an unbounded body or
// log it. The caller's fetch AbortSignal also bounds all stream reads.
export async function readProviderJson(response: Response, limit = 16384): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error("Empty provider response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error("Provider response exceeds budget"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid provider response");
  return value as Record<string, unknown>;
}
