import sharp from "sharp";
import { ApiError, badRequest } from "@/src/lib/api-error";
import { readBoundedBody } from "@/src/lib/body";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 16 * 1024 * 1024;
const MIME_FORMATS: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

export const boundedRequestBytes = readBoundedBody;

export async function normalizePhoto(bytes: Buffer, mimeType: string) {
  const format = MIME_FORMATS[mimeType];
  if (!format) throw new ApiError(415, "UNSUPPORTED_IMAGE", "Use JPEG, PNG or static WebP");
  if (!bytes.length) throw badRequest("EMPTY_PHOTO", "The photo is empty");
  if (bytes.length > MAX_PHOTO_BYTES) throw new ApiError(413, "PHOTO_TOO_LARGE", "The photo exceeds 4 MiB");
  // Reject XML/SVG and unrelated formats before invoking any image decoder.
  const signature = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? "jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "png"
    : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" ? "webp" : null;
  if (!signature) throw badRequest("INVALID_IMAGE", "The file does not have a supported image signature");
  if (signature !== format) throw new ApiError(415, "UNSUPPORTED_IMAGE", "MIME type must match the image signature");
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PHOTO_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1) {
      throw new ApiError(415, "UNSUPPORTED_IMAGE", "MIME type must match a single-frame image");
    }
    // Sharp strips metadata by default. Rotate before stripping orientation.
    const jpeg = await image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
    if (jpeg.length > 2 * 1024 * 1024) throw new ApiError(413, "PHOTO_TOO_LARGE", "The normalized photo is too large");
    return jpeg;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badRequest("INVALID_IMAGE", "The image cannot be safely decoded or exceeds the pixel limit");
  }
}

export async function readEquipmentPhoto(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload photo using multipart/form-data");
  const body = await boundedRequestBytes(request, MAX_PHOTO_BYTES + 65536);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), { headers: { "content-type": contentType } }).formData();
  } catch { throw badRequest("INVALID_MULTIPART", "The upload is not valid multipart data"); }
  const values = form.getAll("photo");
  if (values.length !== 1 || [...form.keys()].some((key) => key !== "photo") || typeof values[0] === "string" || !values[0]) {
    throw badRequest("INVALID_PHOTO_FIELD", "Provide exactly one file field named photo");
  }
  const file = values[0];
  if (file.size > MAX_PHOTO_BYTES) throw new ApiError(413, "PHOTO_TOO_LARGE", "The photo exceeds 4 MiB");
  return normalizePhoto(Buffer.from(await file.arrayBuffer()), file.type.toLowerCase());
}
