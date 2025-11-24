import { createClient } from "redis";

export const client = createClient({
  url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  socket:
    process.env.NODE_ENV === "production"
      ? {
          tls: true,
          rejectUnauthorized: false,
        }
      : undefined,
});
