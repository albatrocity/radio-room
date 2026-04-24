import { describe, test, expect, beforeAll } from "vitest"
import { eq } from "drizzle-orm"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, bearer } from "better-auth/plugins"
import { authSqliteTestSchema, openAuthTestSqlite, user as userTable } from "./test/sqliteAuthSchema"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

function sessionHeaders(token: string) {
  return new Headers({ Authorization: `Bearer ${token}` })
}

describe("Better-Auth integration", () => {
  let auth: ReturnType<typeof betterAuth>
  let testDb: BetterSQLite3Database<typeof authSqliteTestSchema>

  beforeAll(async () => {
    const { db } = openAuthTestSqlite()
    testDb = db

    auth = betterAuth({
      database: drizzleAdapter(db, { provider: "sqlite", schema: authSqliteTestSchema }),
      baseURL: "http://127.0.0.1:3000",
      basePath: "/api/auth",
      emailAndPassword: { enabled: true },
      plugins: [bearer(), admin()],
      trustedOrigins: ["http://127.0.0.1:3000"],
      secret: "test-secret-at-least-32-characters-long",
    })
  })

  test("sign up with email/password creates user and returns session", async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      },
    })

    expect(result.user).toBeDefined()
    expect(result.user.email).toBe("test@example.com")
    expect(result.user.name).toBe("Test User")
    expect(result.token).toBeDefined()
  })

  test("sign in with correct credentials returns session", async () => {
    const result = await auth.api.signInEmail({
      body: {
        email: "test@example.com",
        password: "password123",
      },
    })

    expect(result.token).toBeDefined()
    expect(result.user.email).toBe("test@example.com")
  })

  test("sign in with wrong password returns error", async () => {
    try {
      await auth.api.signInEmail({
        body: {
          email: "test@example.com",
          password: "wrongpassword",
        },
      })
      expect.fail("Should have thrown")
    } catch (error: any) {
      expect(error).toBeDefined()
    }
  })

  test("get session with valid token returns user and session", async () => {
    const signInResult = await auth.api.signInEmail({
      body: {
        email: "test@example.com",
        password: "password123",
      },
    })

    const session = await auth.api.getSession({
      headers: sessionHeaders(signInResult.token),
    })

    expect(session).not.toBeNull()
    expect(session?.user.email).toBe("test@example.com")
  })

  test("get session with invalid token returns null", async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ Authorization: "Bearer invalid-not-a-session" }),
    })

    expect(session).toBeNull()
  })

  test("new users default to 'user' role", async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: "regular@example.com",
        password: "password123",
        name: "Regular User",
      },
    })

    expect(result.user.role).toBe("user")
  })

  test("admin role assignment via setRole", async () => {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "admin-test@example.com",
        password: "password123",
        name: "Admin Test",
      },
    })

    // Seed-style: promote the first account to admin in the DB, then sign in so the session has admin.
    await testDb
      .update(userTable)
      .set({ role: "admin" })
      .where(eq(userTable.email, "test@example.com"))

    const adminSignIn = await auth.api.signInEmail({
      body: {
        email: "test@example.com",
        password: "password123",
      },
    })

    // Now set role on the new user
    await auth.api.setRole({
      body: { userId: signUpResult.user.id, role: "admin" },
      headers: sessionHeaders(adminSignIn.token),
    })

    const session = await auth.api.getSession({
      headers: sessionHeaders(signUpResult.token),
    })

    expect(session?.user.role).toBe("admin")
  })

  test("duplicate email signup fails", async () => {
    try {
      await auth.api.signUpEmail({
        body: {
          email: "test@example.com",
          password: "password123",
          name: "Duplicate User",
        },
      })
      expect.fail("Should have thrown for duplicate email")
    } catch (error: any) {
      expect(error).toBeDefined()
    }
  })

  test("full lifecycle: signup -> signout -> signin -> get session", async () => {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "lifecycle@example.com",
        password: "password123",
        name: "Lifecycle User",
      },
    })
    expect(signUpResult.user).toBeDefined()

    const signInResult = await auth.api.signInEmail({
      body: {
        email: "lifecycle@example.com",
        password: "password123",
      },
    })
    expect(signInResult.token).toBeDefined()

    const session = await auth.api.getSession({
      headers: sessionHeaders(signInResult.token),
    })
    expect(session?.user.email).toBe("lifecycle@example.com")
  })
})
