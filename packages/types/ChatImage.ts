/** Max multipart body size per chat/artwork image upload (before server processing). */
export const CHAT_IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024

/** GIF/SVG pass-through cap (not re-encoded to JPEG). */
export const CHAT_IMAGE_UNPROCESSED_MAX_BYTES = 4 * 1024 * 1024

/** Max long edge for stored JPEG output. */
export const CHAT_IMAGE_MAX_DIMENSION = 1600

/** JPEG quality for stored chat/artwork images (1–100). */
export const CHAT_IMAGE_JPEG_QUALITY = 80
