import convert from "heic-convert"

export async function convertHeicToJpeg(base64Data: string): Promise<string> {
  const inputBuffer = Buffer.from(base64Data, "base64")
  const outputBuffer = await convert({
    buffer: inputBuffer,
    format: "JPEG",
    quality: 0.9,
  })
  return Buffer.from(outputBuffer).toString("base64")
}

export function isHeicMimeType(mimeType: string): boolean {
  return mimeType === "image/heic" || mimeType === "image/heif"
}
