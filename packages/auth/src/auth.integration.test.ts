import { describe, test, expect, beforeAll } from "vitest"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { drizzle } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"

describe("Better-Auth integration", () => {
  let auth: ReturnType<typeof betterAuth>

  beforeAll(async () => {
    const sqlite = new Database(":memory:")
    const db = drizzle(sqlite)

    auth = betterAuth({
      database: drizzleAdapter(db, { provider: "sqlite" }),
      basePath: "/api/auth",
      emailAndPassword: { enabled: true },
      plugins: [admin()],
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
    expect(result.session).toBeDefined()
  })

  test("sign in with correct credentials returns session", async () => {
    const result = await auth.api.signInEmail({
      body: {
        email: "test@example.com",
        password: "password123",
      },
    })

    expect(result.session).toBeDefined()
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
      headers: new Headers({
        cookie: `better-auth.session_token=${signInResult.session.token}`,
      }),
    })

    expect(session).not.toBeNull()
    expect(session?.user.email).toBe("test@example.com")
  })

  test("get session with invalid token returns null", async () => {
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: "better-auth.session_token=invalid-token",
      }),
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

    const adminSignIn = await auth.api.signInEmail({
      body: {
        email: "test@example.com",
        password: "password123",
      },
    })

    // First, make the first user admin so they can set roles
    // (In real code, the seed script does this)
    await auth.api.setRole({
      body: { userId: adminSignIn.user.id, role: "admin" },
      headers: new Headers({
        cookie: `better-auth.session_token=${adminSignIn.session.token}`,
      }),
    })

    // Now set role on the new user
    await auth.api.setRole({
      body: { userId: signUpResult.user.id, role: "admin" },
      headers: new Headers({
        cookie: `better-auth.session_token=${adminSignIn.session.token}`,
      }),
    })

    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${signUpResult.session.token}`,
      }),
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
    expect(signInResult.session).toBeDefined()

    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${signInResult.session.token}`,
      }),
    })
    expect(session?.user.email).toBe("lifecycle@example.com")
  })
})
