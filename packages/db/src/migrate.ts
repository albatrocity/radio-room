import path from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required")
  }

  const db = drizzle({ connection: { connectionString } })
  await migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") })
  console.log("Migrations applied successfully")
  process.exit(0)
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
