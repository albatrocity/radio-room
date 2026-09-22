import type { ItemDefinition, ItemUseResult } from "@repo/types"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

/** Keep in sync with `BRIDGE_SAY_MAX_CHARS` in `@repo/adapter-bridge` (ADR 0178). */
const SAY_MAX_CHARS = 100

function sanitizeMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\t\n\r]+/g, " ")
    .trim()
  return cleaned.length > 0 ? cleaned : null
}

function readFormValues(
  callContext: unknown,
): Record<string, string | number> {
  if (!callContext || typeof callContext !== "object" || Array.isArray(callContext)) {
    return {}
  }
  return (callContext as { formValues?: Record<string, string | number> }).formValues ?? {}
}

async function useBurnerPhone(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  _definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  const formValues = readFormValues(callContext)
  const text = sanitizeMessage(formValues.message)
  const voice = typeof formValues.voice === "string" ? formValues.voice.trim() : ""

  if (!text) {
    return { success: false, consumed: false, message: "Enter a message to send." }
  }
  if ([...text].length > SAY_MAX_CHARS) {
    return {
      success: false,
      consumed: false,
      message: `Message must be ${SAY_MAX_CHARS} characters or fewer.`,
    }
  }
  if (!voice) {
    return { success: false, consumed: false, message: "Choose a voice." }
  }

  const speak = deps.context.api.speakOnMediaBridge
  if (typeof speak !== "function") {
    return {
      success: false,
      consumed: false,
      message: "The line is dead — the DJ Mac isn’t linked.",
    }
  }

  const result = await speak(deps.context.roomId, { text, voice })
  if (!result.ok) {
    return { success: false, consumed: false, message: result.message }
  }

  const displayName = await resolveItemUseActorDisplayName(deps, userId)
  await sendAttributedSystemMessage(
    deps,
    `${displayName.label} put a call through on a burner phone.`,
    displayName,
  )

  return {
    success: true,
    consumed: true,
    message: "Your call is going through.",
  }
}

export const burnerPhone = createItem({
  shortId: "burner-phone",
  definition: {
    name: "Burner Phone",
    description: "Send one text-to-speech message to be broadcast over show audio.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 50,
    icon: "Phone",
    rarity: "rare",
    useForm: [
      {
        name: "message",
        label: "Message",
        type: "textarea",
        required: true,
        maxLength: SAY_MAX_CHARS,
        rows: 3,
        placeholder: "What should the DJ Mac say?",
      },
      {
        name: "voice",
        label: "Voice",
        type: "select",
        required: true,
        optionsSource: "mediaBridgeVoices",
      },
    ],
  },
  availableInRoomTypes: ["radio", "live"],
  use: useBurnerPhone,
})
