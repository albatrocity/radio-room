import { checkbox, input } from "@inquirer/prompts"

export type ShopItemSelection = {
  variableName: string
  coinValue: number
}

export type ShopWizardAnswers = {
  shopId: string
  shopConstName: string
  onBuyHandlerName: string
  name: string
  openingMessage?: string
  listedBuybackRate: number
  unlistedBuybackRate: number
  availableItems: ShopItemSelection[]
}

export type ShopPromptItemOption = {
  variableName: string
  label: string
}

type PromptContext = {
  existingShopIds: Set<string>
  items: ShopPromptItemOption[]
}

export async function promptForShopConfig(context: PromptContext): Promise<ShopWizardAnswers> {
  const name = (await input({
    message: "Shop display name:",
    validate: (value) => (value.trim().length > 0 ? true : "Shop name is required."),
  })).trim()

  const suggestedShopId = slugify(name)
  const shopId = (await input({
    message: "Shop ID (kebab-case):",
    default: suggestedShopId,
    validate: (value) => validateShopId(value, context.existingShopIds),
  })).trim()

  const openingMessage = (await input({
    message: "Opening message (optional, supports {{shopName}}):",
    default: "Welcome to {{shopName}}!",
  })).trim()

  const listedBuybackRate = await promptNonNegativeNumber("Listed buyback rate:", 0.5)
  const unlistedBuybackRate = await promptNonNegativeNumber("Unlisted buyback rate:", 0.25)

  const selectedVariableNames = await checkbox<string>({
    message: "Select items to offer in this shop:",
    choices: context.items.map((item) => ({
      value: item.variableName,
      name: item.label,
    })),
    validate: (values) => (values.length > 0 ? true : "Select at least one item."),
  })

  const availableItems: ShopItemSelection[] = []
  for (const variableName of selectedVariableNames) {
    const coinValue = await promptPositiveInt(`Coin value for items.${variableName}.shortId:`, 50)
    availableItems.push({ variableName, coinValue })
  }

  return {
    shopId,
    shopConstName: `${toScreamingSnakeCase(shopId)}_SHOP`,
    onBuyHandlerName: `${toCamelCase(shopId)}OnBuy`,
    name,
    openingMessage: openingMessage.length > 0 ? openingMessage : undefined,
    listedBuybackRate,
    unlistedBuybackRate,
    availableItems,
  }
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

async function promptNonNegativeNumber(message: string, defaultValue: number): Promise<number> {
  const raw = await input({
    message,
    default: String(defaultValue),
    validate: (value) => {
      const parsed = Number.parseFloat(value)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return "Enter a non-negative number."
      }
      return true
    },
  })
  return Number.parseFloat(raw)
}

function validateShopId(value: string, existingShopIds: Set<string>): true | string {
  const shopId = value.trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shopId)) {
    return "Use kebab-case: lowercase letters, numbers, and hyphens."
  }
  if (existingShopIds.has(shopId)) {
    return `Shop ID "${shopId}" already exists.`
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

function toScreamingSnakeCase(value: string): string {
  return value.replace(/-/g, "_").toUpperCase()
}
