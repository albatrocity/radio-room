import { checkbox, confirm, input, search, select } from "@inquirer/prompts"
import type { LucideIconName } from "@repo/types"

export type Rarity = "common" | "uncommon" | "rare" | "legendary"
export type RequiresTarget = "self" | "user" | "queueItem" | "inventoryItem" | "coinAmount"
export type BehaviorKind = "timedModifier" | "passiveDefense" | "customHandler" | "none"

export type EffectType = "flag" | "multiplier" | "additive"

export type TimedModifierEffectConfig = {
  type: EffectType
  intent: "positive" | "negative" | "neutral"
  /** Modifier lifetime in ms (passed through `timedModifierEffect`; stripped before persistence). */
  durationMs: number
  icon?: LucideIconName
  flagConstName?: string
  flagName?: string
  target?: "score" | "coin"
  value?: number
}

export type NewFlagDeclaration = {
  constName: string
  value: string
}

export type TimedModifierConfig = {
  modifierName: string
  successMessage: string
  effects: TimedModifierEffectConfig[]
  newFlags: NewFlagDeclaration[]
  visibility?: "public" | "self"
}

export type PassiveDefenseConfig = {
  intents: Array<"positive" | "negative" | "neutral">
  scope: Array<"modifier" | "queue">
  sourcePlugins: string[]
}

export type ShopConfig = {
  sweetwater?: number
  greenRoom?: number
  startupGuy?: number
}

export type ItemWizardAnswers = {
  name: string
  shortId: string
  variableName: string
  description: string
  icon: LucideIconName
  rarity: Rarity
  coinValue: number
  stackable: boolean
  maxStack: number
  tradeable: boolean
  consumable: boolean
  requiresTarget?: RequiresTarget
  behaviorKind: BehaviorKind
  timedModifier?: TimedModifierConfig
  passiveDefense?: PassiveDefenseConfig
  shops: ShopConfig
}

/**
 * Cross-folder flag constants from `items/textEffects/sizeShift.ts` that can be
 * picked from when authoring a timed-modifier item. New flags created via the
 * wizard are inlined into the generated item file as a local const (see
 * `buildItemFile` in generators.ts), not appended here.
 */
const FLAG_OPTIONS = [
  "GROW_FLAG",
  "SHRINK_FLAG",
  "ECHO_FLAG",
] as const

type PromptContext = {
  existingShortIds: Set<string>
  iconNames: LucideIconName[]
}

export async function promptForItemConfig(context: PromptContext): Promise<ItemWizardAnswers> {
  const name = (
    await input({
      message: "Display name:",
      validate: (value) => (value.trim().length > 0 ? true : "Name is required."),
    })
  ).trim()

  const generatedShortId = slugify(name)
  const shortId = (
    await input({
      message: "Short ID (kebab-case):",
      default: generatedShortId,
      validate: (value) => validateShortId(value, context.existingShortIds),
    })
  ).trim()

  const variableName = toCamelCase(shortId)

  const description = (
    await input({
      message: "Description:",
      validate: (value) => (value.trim().length > 0 ? true : "Description is required."),
    })
  ).trim()

  const icon = await search({
    message: "Icon (PascalCase Lucide icon name):",
    source: async (term) => {
      const query = (term ?? "").toLowerCase().trim()
      const matches = query
        ? context.iconNames.filter((name) => name.toLowerCase().includes(query))
        : context.iconNames
      return matches.slice(0, 30).map((name) => ({
        value: name,
        name,
      }))
    },
  })

  const rarity = await select<Rarity>({
    message: "Rarity:",
    choices: [
      { value: "common", name: "common" },
      { value: "uncommon", name: "uncommon" },
      { value: "rare", name: "rare" },
      { value: "legendary", name: "legendary" },
    ],
  })

  const coinValue = await promptPositiveInt("Default coin value:", 50)
  const stackable = await confirm({ message: "Stackable?", default: true })
  const maxStack = stackable ? await promptPositiveInt("Max stack:", 3) : 1
  const tradeable = await confirm({ message: "Tradeable?", default: true })
  const consumable = await confirm({ message: "Consumable?", default: true })

  const requiresTarget = await select<RequiresTarget | "none">({
    message: "Requires target?",
    choices: [
      { value: "none", name: "none / self (default)" },
      { value: "self", name: "self" },
      { value: "user", name: "user" },
      { value: "queueItem", name: "queueItem" },
      { value: "inventoryItem", name: "inventoryItem" },
      { value: "coinAmount", name: "coinAmount" },
    ],
  })

  const behaviorKind = await select<BehaviorKind>({
    message: "Behavior type:",
    choices: [
      { value: "timedModifier", name: "Timed modifier (pedal-style)" },
      { value: "passiveDefense", name: "Passive defense" },
      { value: "customHandler", name: "Custom handler (stub)" },
      { value: "none", name: "None" },
    ],
  })

  const timedModifier =
    behaviorKind === "timedModifier" ? await promptTimedModifier(shortId, name) : undefined
  const passiveDefense =
    behaviorKind === "passiveDefense" ? await promptPassiveDefense() : undefined
  const shops = await promptShops()

  return {
    name,
    shortId,
    variableName,
    description,
    icon,
    rarity,
    coinValue,
    stackable,
    maxStack,
    tradeable,
    consumable,
    requiresTarget: requiresTarget === "none" ? undefined : requiresTarget,
    behaviorKind,
    timedModifier,
    passiveDefense,
    shops,
  }
}

async function promptTimedModifier(
  shortId: string,
  displayName: string,
): Promise<TimedModifierConfig> {
  const modifierName = (
    await input({
      message: "Modifier name:",
      default: shortId,
      validate: (value) =>
        value.trim().length > 0 ? true : "Modifier name is required for timed modifier behavior.",
    })
  ).trim()

  const successMessage = (
    await input({
      message: "Success message shown to item user:",
      default: `${displayName} activated. It was lost with use.`,
      validate: (value) => (value.trim().length > 0 ? true : "Success message is required."),
    })
  ).trim()

  const effects: TimedModifierEffectConfig[] = []
  const newFlags: NewFlagDeclaration[] = []
  let addAnother = true
  while (addAnother) {
    const effect = await promptTimedModifierEffect({ iconDefault: undefined })
    effects.push(effect.effect)
    if (effect.newFlag) {
      newFlags.push(effect.newFlag)
    }
    addAnother = await confirm({ message: "Add another effect?", default: false })
  }

  const visibility = await select<"public" | "self">({
    message: "Modifier visibility (effect bars in listener list):",
    choices: [
      { value: "public", name: "public (visible to everyone)" },
      { value: "self", name: "self (only visible to owner)" },
    ],
  })

  return {
    modifierName,
    successMessage,
    effects,
    newFlags,
    visibility: visibility === "public" ? undefined : visibility,
  }
}

async function promptTimedModifierEffect(params: {
  iconDefault?: LucideIconName
}): Promise<{ effect: TimedModifierEffectConfig; newFlag?: NewFlagDeclaration }> {
  const effectType = await select<EffectType>({
    message: "Effect type:",
    choices: [
      { value: "flag", name: "flag" },
      { value: "multiplier", name: "multiplier" },
      { value: "additive", name: "additive" },
    ],
  })

  const intent = await select<"positive" | "negative" | "neutral">({
    message: "Effect intent:",
    choices: [
      { value: "positive", name: "positive" },
      { value: "negative", name: "negative" },
      { value: "neutral", name: "neutral" },
    ],
  })

  const durationMs = await promptPositiveInt("Effect duration (milliseconds):", 300_000)

  const iconOverride = await input({
    message: "Icon override (optional PascalCase Lucide name):",
    default: params.iconDefault ?? "",
  })
  const icon = iconOverride.trim().length > 0 ? (iconOverride.trim() as LucideIconName) : undefined

  if (effectType === "flag") {
    const flagChoice = await select<string>({
      message: "Flag constant:",
      choices: [
        ...FLAG_OPTIONS.map((value) => ({ value, name: value })),
        { value: "__NEW_FLAG__", name: "Create new flag constant" },
      ],
    })

    if (flagChoice !== "__NEW_FLAG__") {
      return {
        effect: { type: "flag", intent, durationMs, icon, flagConstName: flagChoice },
      }
    }

    const rawFlag = (
      await input({
        message: "New flag value (snake_case):",
        validate: (value) =>
          /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value.trim())
            ? true
            : "Use snake_case: lowercase letters, numbers, and underscores.",
      })
    ).trim()

    const constName = toFlagConstName(rawFlag)
    return {
      effect: {
        type: "flag",
        intent,
        durationMs,
        icon,
        flagConstName: constName,
        flagName: rawFlag,
      },
      newFlag: { constName, value: rawFlag },
    }
  }

  const target = await select<"score" | "coin">({
    message: "Target attribute:",
    choices: [
      { value: "score", name: "score" },
      { value: "coin", name: "coin" },
    ],
  })

  const value = await promptNumber(
    effectType === "multiplier" ? "Multiplier value (e.g. 1.5):" : "Additive value (e.g. 10):",
    effectType === "multiplier" ? 1.5 : 10,
  )

  return {
    effect: {
      type: effectType,
      intent,
      durationMs,
      icon,
      target,
      value,
    },
  }
}

async function promptPassiveDefense(): Promise<PassiveDefenseConfig> {
  const intents = await checkbox<Array<"positive" | "negative" | "neutral">>({
    message: "Defense intents to block:",
    choices: [
      { value: "positive", name: "positive" },
      { value: "negative", name: "negative", checked: true },
      { value: "neutral", name: "neutral" },
    ],
    validate: (values) => (values.length > 0 ? true : "Select at least one intent."),
  })

  const scope = await checkbox<Array<"modifier" | "queue">>({
    message: "Defense scope:",
    choices: [
      { value: "modifier", name: "modifier", checked: true },
      { value: "queue", name: "queue" },
    ],
    validate: (values) => (values.length > 0 ? true : "Select at least one scope."),
  })

  const sourcePluginInput = (
    await input({
      message: "Source plugins (comma-separated, optional):",
    })
  ).trim()

  const sourcePlugins = sourcePluginInput
    ? sourcePluginInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : []

  return { intents, scope, sourcePlugins }
}

async function promptShops(): Promise<ShopConfig> {
  const shops = await checkbox<Array<"sweetwater" | "greenRoom" | "startupGuy">>({
    message: "Register item in shops:",
    choices: [
      { value: "sweetwater", name: "Sweetwater" },
      { value: "greenRoom", name: "Green Room" },
      { value: "startupGuy", name: "Startup Guy" },
    ],
  })

  const config: ShopConfig = {}

  if (shops.includes("sweetwater")) {
    config.sweetwater = await promptPositiveInt("Sweetwater coin value:", 20)
  }
  if (shops.includes("greenRoom")) {
    config.greenRoom = await promptPositiveInt("Green Room coin value:", 50)
  }
  if (shops.includes("startupGuy")) {
    config.startupGuy = await promptPositiveInt("Startup Guy coin value:", 200)
  }

  return config
}

async function promptPositiveInt(message: string, defaultValue: number): Promise<number> {
  const raw = await input({
    message,
    default: String(defaultValue),
    validate: (value) => {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return "Enter a positive integer."
      }
      return true
    },
  })
  return Number.parseInt(raw, 10)
}

async function promptNumber(message: string, defaultValue: number): Promise<number> {
  const raw = await input({
    message,
    default: String(defaultValue),
    validate: (value) => {
      const parsed = Number.parseFloat(value)
      if (!Number.isFinite(parsed)) {
        return "Enter a valid number."
      }
      return true
    },
  })
  return Number.parseFloat(raw)
}

function validateShortId(shortIdValue: string, existingShortIds: Set<string>): true | string {
  const value = shortIdValue.trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return "Use kebab-case: lowercase letters, numbers, and hyphens."
  }
  if (existingShortIds.has(value)) {
    return `Item shortId "${value}" already exists.`
  }
  return true
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())
}

function toFlagConstName(value: string): string {
  return `${value.toUpperCase()}_FLAG`
}
