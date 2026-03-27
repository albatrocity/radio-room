process.env.SEED_MODE = "true"

async function seedAdmin() {
  const { auth } = await import("@repo/auth/server")

  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  const name = process.env.SEED_ADMIN_NAME || "Admin"

  if (!email || !password) {
    console.error("Required environment variables:")
    console.error("  SEED_ADMIN_EMAIL    - email address for the admin account")
    console.error("  SEED_ADMIN_PASSWORD - password (min 8 characters)")
    console.error("  SEED_ADMIN_NAME     - display name (optional, defaults to 'Admin')")
    process.exit(1)
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters")
    process.exit(1)
  }

  let userId: string

  const { db, user: userTable } = await import("@repo/db")
  const { eq } = await import("drizzle-orm")

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: new Headers(),
    })
    userId = result.user.id
    console.log(`User created (${userId})`)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (!msg.includes("already exists")) {
      console.error("Failed to create admin user:", msg)
      process.exit(1)
    }

    console.log("User already exists, looking up...")
    const rows = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1)

    if (!rows[0]) {
      console.error(`User lookup failed for ${email}`)
      process.exit(1)
    }
    userId = rows[0].id
  }

  await db
    .update(userTable)
    .set({ role: "admin" })
    .where(eq(userTable.id, userId))

  console.log(`Admin user ready:`)
  console.log(`  Email: ${email}`)
  console.log(`  Name:  ${name}`)
  console.log(`  Role:  admin`)
  console.log(`  ID:    ${userId}`)

  process.exit(0)
}

seedAdmin()
