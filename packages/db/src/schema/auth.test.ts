import { describe, test, expect } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { user, session, account, verification, invitation } from "./auth"

describe("auth schema", () => {
  describe("user table", () => {
    test("has required columns", () => {
      const columns = getTableColumns(user)
      expect(columns.id).toBeDefined()
      expect(columns.name).toBeDefined()
      expect(columns.email).toBeDefined()
      expect(columns.role).toBeDefined()
      expect(columns.createdAt).toBeDefined()
      expect(columns.updatedAt).toBeDefined()
      expect(columns.emailVerified).toBeDefined()
      expect(columns.image).toBeDefined()
    })

    test("role column has default value", () => {
      const columns = getTableColumns(user)
      expect(columns.role.hasDefault).toBe(true)
    })
  })

  describe("session table", () => {
    test("has required columns", () => {
      const columns = getTableColumns(session)
      expect(columns.id).toBeDefined()
      expect(columns.userId).toBeDefined()
      expect(columns.token).toBeDefined()
      expect(columns.expiresAt).toBeDefined()
      expect(columns.ipAddress).toBeDefined()
      expect(columns.userAgent).toBeDefined()
    })
  })

  describe("account table", () => {
    test("has required columns", () => {
      const columns = getTableColumns(account)
      expect(columns.id).toBeDefined()
      expect(columns.userId).toBeDefined()
      expect(columns.providerId).toBeDefined()
      expect(columns.accountId).toBeDefined()
      expect(columns.accessToken).toBeDefined()
      expect(columns.refreshToken).toBeDefined()
    })
  })

  describe("verification table", () => {
    test("has required columns", () => {
      const columns = getTableColumns(verification)
      expect(columns.id).toBeDefined()
      expect(columns.identifier).toBeDefined()
      expect(columns.value).toBeDefined()
      expect(columns.expiresAt).toBeDefined()
    })
  })

  describe("invitation table", () => {
    test("has required columns", () => {
      const columns = getTableColumns(invitation)
      expect(columns.id).toBeDefined()
      expect(columns.email).toBeDefined()
      expect(columns.codeHash).toBeDefined()
      expect(columns.invitedBy).toBeDefined()
      expect(columns.maxUses).toBeDefined()
      expect(columns.useCount).toBeDefined()
      expect(columns.expiresAt).toBeDefined()
      expect(columns.createdAt).toBeDefined()
    })

    test("maxUses defaults to 1", () => {
      const columns = getTableColumns(invitation)
      expect(columns.maxUses.hasDefault).toBe(true)
    })

    test("useCount defaults to 0", () => {
      const columns = getTableColumns(invitation)
      expect(columns.useCount.hasDefault).toBe(true)
    })
  })
})
