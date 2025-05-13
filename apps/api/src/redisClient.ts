import { createClient as redisCreateClient } from "redis";

export async function createClient() {
  const client = redisCreateClient({
    url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    socket:
      process.env.NODE_ENV === "production"
        ? {
            tls: true,
            rejectUnauthorized: false,
          }
        : undefined,
  });
  await client.connect();

  client.on("error", (error) => {
    console.error(error);
  });

  return client;
}
