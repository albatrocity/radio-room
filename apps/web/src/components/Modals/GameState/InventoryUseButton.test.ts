import { describe, expect, it } from "vitest"
import type { ItemDefinition } from "@repo/types"
import {
  advanceTargetThenForm,
  hasItemUseForm,
  mergeTargetAndFormValues,
  shouldPickTargetThenForm,
} from "./inventoryUseCompose"

const passwordField = {
  name: "password",
  label: "Password",
  type: "password" as const,
  required: true,
}

function def(partial: Partial<ItemDefinition>): ItemDefinition {
  return {
    id: "plugin:test-item",
    sourcePlugin: "plugin",
    shortId: "test-item",
    name: "Test",
    description: "Test item",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    ...partial,
  }
}

describe("InventoryUseButton picker-then-form compose (ADR 0193)", () => {
  describe("shouldPickTargetThenForm", () => {
    it("is true when an entity requiresTarget and useForm are both set", () => {
      expect(
        shouldPickTargetThenForm(
          "inventoryItems",
          def({ requiresTarget: "inventoryItems", useForm: [passwordField] }),
        ),
      ).toBe(true)
      expect(
        shouldPickTargetThenForm("user", def({ requiresTarget: "user", useForm: [passwordField] })),
      ).toBe(true)
      expect(
        shouldPickTargetThenForm(
          "queueItem",
          def({ requiresTarget: "queueItem", useForm: [passwordField] }),
        ),
      ).toBe(true)
    })

    it("is false for form-only items (useForm without entity target)", () => {
      expect(shouldPickTargetThenForm(undefined, def({ useForm: [passwordField] }))).toBe(false)
      expect(shouldPickTargetThenForm("self", def({ requiresTarget: "self", useForm: [passwordField] }))).toBe(
        false,
      )
    })

    it("is false for target-only items (no useForm)", () => {
      expect(shouldPickTargetThenForm("user", def({ requiresTarget: "user" }))).toBe(false)
      expect(shouldPickTargetThenForm("inventoryItems", def({ requiresTarget: "inventoryItems" }))).toBe(
        false,
      )
    })
  })

  describe("picker-then-form sequence", () => {
    it("advances pick → form on target, then back to pick on confirm or close", () => {
      let phase = advanceTargetThenForm("pick", { type: "TARGET_PICKED" })
      expect(phase).toBe("form")

      phase = advanceTargetThenForm(phase, { type: "FORM_CONFIRMED" })
      expect(phase).toBe("pick")

      phase = advanceTargetThenForm(phase, { type: "TARGET_PICKED" })
      expect(phase).toBe("form")

      phase = advanceTargetThenForm(phase, { type: "FORM_CLOSED" })
      expect(phase).toBe("pick")
    })

    it("merges target fields with formValues for the use payload", () => {
      expect(
        mergeTargetAndFormValues(
          { targetInventoryItemIds: ["a", "b"] },
          { password: "secret", label: "Tour case" },
        ),
      ).toEqual({
        targetInventoryItemIds: ["a", "b"],
        formValues: { password: "secret", label: "Tour case" },
      })

      expect(
        mergeTargetAndFormValues({ targetUserId: "u1" }, { note: "hi" }),
      ).toEqual({
        targetUserId: "u1",
        formValues: { note: "hi" },
      })
    })
  })

  describe("hasItemUseForm", () => {
    it("requires a non-empty useForm array", () => {
      expect(hasItemUseForm(undefined)).toBe(false)
      expect(hasItemUseForm(def({}))).toBe(false)
      expect(hasItemUseForm(def({ useForm: [] }))).toBe(false)
      expect(hasItemUseForm(def({ useForm: [passwordField] }))).toBe(true)
    })
  })
})
