import { z } from "zod";
import { ApiError } from "@/src/lib/api-error";
import type { EquipmentItem } from "./matching";
import { isProduction } from "@/src/lib/security/config";

export const VISION_MODEL_ID = "google/siglip2-base-patch16-224";
export const VISION_MODEL_REVISION = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2";
const replySchema = z.object({
  modelId: z.literal(VISION_MODEL_ID), modelRevision: z.literal(VISION_MODEL_REVISION),
  status: z.enum(["needs_confirmation", "unknown"]),
  candidates: z.array(z.object({ equipmentId: z.string(), score: z.number().finite().min(0).max(1) }).strict()).max(3),
}).strict();

export function visionConfiguration() {
  const raw = process.env.EQUIPMENT_VISION_URL;
  const token = process.env.EQUIPMENT_VISION_TOKEN;
  if (!raw || !token || !/^[A-Za-z0-9._~-]{32,256}$/.test(token) || token.startsWith("replace-")) {
    throw new ApiError(503, "VISION_NOT_CONFIGURED", "Equipment photo recognition has not been configured");
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiError(503, "VISION_NOT_CONFIGURED", "Invalid vision service configuration"); }
  if (!["http:", "https:"].includes(url.protocol) || (isProduction() && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new ApiError(503, "VISION_NOT_CONFIGURED", "Use the root URL of the private vision service");
  }
  const timeoutMs = Number(process.env.EQUIPMENT_VISION_TIMEOUT_MS ?? "30000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new ApiError(503, "VISION_NOT_CONFIGURED", "Invalid vision timeout");
  return { url: new URL("/recognize", url).toString(), token, timeoutMs };
}

export function validateVisionReply(value: unknown, equipment: EquipmentItem[]) {
  const result = replySchema.safeParse(value);
  if (!result.success) throw new ApiError(502, "INVALID_VISION_RESPONSE", "The recognition service returned an invalid response");
  const reply = result.data;
  const known = new Map(equipment.map((item) => [item.id, item]));
  if (new Set(reply.candidates.map((c) => c.equipmentId)).size !== reply.candidates.length
    || reply.candidates.some((c) => !known.has(c.equipmentId))
    || (reply.status === "unknown" ? reply.candidates.length !== 0 : reply.candidates.length === 0)) {
    throw new ApiError(502, "INVALID_VISION_RESPONSE", "The recognition service returned an unknown or inconsistent candidate");
  }
  return { ...reply, candidates: reply.candidates.sort((a, b) => b.score - a.score || a.equipmentId.localeCompare(b.equipmentId))
    .map((c) => ({ ...known.get(c.equipmentId)!, score: c.score })) };
}

export async function recognizeEquipmentPhoto(jpeg: Buffer, equipment: EquipmentItem[], signal?: AbortSignal) {
  const config = visionConfiguration();
  if (!equipment.length || equipment.length > 64) throw new ApiError(503, "VISION_CATALOG_UNSUPPORTED", "The recognition catalog must contain 1–64 active equipment entries");
  try {
    const response = await fetch(config.url, {
      method: "POST", redirect: "error", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]) : AbortSignal.timeout(config.timeoutMs),
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ imageBase64: jpeg.toString("base64"), candidates: equipment.map(({ id, name }) => ({ id, name })) }),
    });
    if (response.status === 429) throw new ApiError(429, "VISION_BUSY", "Recognition is busy; retry later");
    if (!response.ok) throw new ApiError(503, "VISION_UNAVAILABLE", "The recognition service is unavailable");
    if (!response.body) throw new Error("Empty vision response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65536) { await reader.cancel(); throw new ApiError(502, "INVALID_VISION_RESPONSE", "The recognition response is too large"); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    let json: unknown;
    try { json = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); }
    catch { throw new ApiError(502, "INVALID_VISION_RESPONSE", "The recognition service returned invalid JSON"); }
    return validateVisionReply(json, equipment);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "VISION_UNAVAILABLE", "The recognition service failed or timed out");
  }
}
