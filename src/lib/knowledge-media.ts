export const MAX_KNOWLEDGE_IMAGE_BYTES = 5 * 1024 * 1024;

export function knowledgeImageType(bytes: Uint8Array): { mime: "image/jpeg" | "image/png"; extension: "jpg" | "png" } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
    return { mime: "image/png", extension: "png" };
  }
  return null;
}

export function knowledgeMediaConfig() {
  const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim();
  const region = process.env.MEDIA_S3_REGION?.trim() || "auto";
  const bucket = process.env.MEDIA_S3_BUCKET?.trim();
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY?.trim();
  const publicBase = process.env.MEDIA_PUBLIC_BASE_URL?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBase) return null;
  try {
    const uploadUrl = new URL(endpoint);
    const publicUrl = new URL(publicBase);
    if (uploadUrl.protocol !== "https:" || publicUrl.protocol !== "https:" ||
        uploadUrl.username || uploadUrl.password || publicUrl.username || publicUrl.password ||
        uploadUrl.search || uploadUrl.hash || publicUrl.search || publicUrl.hash) return null;
    return { endpoint: uploadUrl.toString(), region, bucket, accessKeyId, secretAccessKey, publicBase: publicUrl.toString().replace(/\/$/, "") };
  } catch { return null; }
}
