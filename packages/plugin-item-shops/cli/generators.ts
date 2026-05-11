import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ItemWizardAnswers, NewFlagDeclaration, TimedModifierEffectConfig } from "./prompts"

export async function generateItemScaffold(
  packageDir: string,
  answers: ItemWizardAnswers,
): Promise<string[]> {
  const changedFiles: string[] = []
  const itemDir = join(packageDir, "items", answers.shortId)
  const itemFile = join(itemDir, "index.ts")
  const testFile = join(itemDir, `${answers.shortId}.test.ts`)
  const itemsIndexPath = join(packageDir, "items", "index.ts")
  const gameLogicTextStacksPath = join(packageDir, "..", "game-logic", "src", "textEffectStacks.ts")
  const pluginBaseFlagsPath = join(
    packageDir,
    "..",
    "plugin-base",
    "helpers",
    "textTransform",
    "flags.ts",
  )
  const pluginBaseIndexPath = join(packageDir, "..", "plugin-base", "index.ts")

  await mkdir(itemDir, { recursive: true })

  await writeFile(itemFile, buildItemFile(answers), "utf8")
  changedFiles.push(itemFile)

  await writeFile(testFile, buildTestFile(answers), "utf8")
  changedFiles.push(testFile)

  const updatedItemsIndex = await updateItemsIndex(itemsIndexPath, answers)
  if (updatedItemsIndex) changedFiles.push(itemsIndexPath)

  const newFlags = answers.timedModifier?.newFlags ?? []
  if (newFlags.length > 0) {
    const updatedTextStacks = await appendGameLogicFlags(gameLogicTextStacksPath, newFlags)
    if (updatedTextStacks) changedFiles.push(gameLogicTextStacksPath)

    const updatedPluginBaseFlags = await appendPluginBaseFlagsReExport(
      pluginBaseFlagsPath,
      newFlags,
    )
    if (updatedPluginBaseFlags) changedFiles.push(pluginBaseFlagsPath)

    const updatedPluginBaseIndex = await appendPluginBaseIndexReExport(
      pluginBaseIndexPath,
      newFlags,
    )
    if (updatedPluginBaseIndex) changedFiles.push(pluginBaseIndexPath)
  }

  if (answers.shops.sweetwater != null) {
    const path = join(packageDir, "shops", "sweetwater", "index.ts")
    const updated = await appendShopItem(path, answers.variableName, answers.shops.sweetwater)
    if (updated) changedFiles.push(path)
  }
  if (answers.shops.greenRoom != null) {
    const path = join(packageDir, "shops", "green-room", "index.ts")
    const updated = await appendShopItem(path, answers.variableName, answers.shops.greenRoom)
    if (updated) changedFiles.push(path)
  }
  if (answers.shops.startupGuy != null) {
    const path = join(packageDir, "shops", "index.ts")
    const updated = await appendStartupGuyItem(path, answers.variableName, answers.shops.startupGuy)
    if (updated) changedFiles.push(path)
  }

  return changedFiles
}

async function updateItemsIndex(
  itemsIndexPath: string,
  answers: ItemWizardAnswers,
): Promise<boolean> {
  let content = await readFile(itemsIndexPath, "utf8")
  let changed = false

  const importLine = `import { ${answers.variableName} } from "./${answers.shortId}"`
  if (!content.includes(importLine)) {
    const marker = 'import type { ItemUseHandler } from "./shared/types"'
    content = content.replace(marker, `${importLine}\n${marker}`)
    changed = true
  }

  const objectEntry = `  ${answers.variableName},`
  if (!content.includes(objectEntry)) {
    content = content.replace("} as const", `${objectEntry}\n} as const`)
    changed = true
  }

  if (changed) {
    await writeFile(itemsIndexPath, content, "utf8")
  }

  return changed
}

async function appendShopItem(
  shopPath: string,
  variableName: string,
  coinValue: number,
): Promise<boolean> {
  const content = await readFile(shopPath, "utf8")
  const itemExpression = `{ shortId: items.${variableName}.shortId, coinValue: ${coinValue} }`
  if (content.includes(itemExpression)) return false

  const replaced = content.replace(
    /availableItems:\s*\[\n([\s\S]*?)\n\s*],/,
    (_match, body: string) => {
      const row = `    ${itemExpression},`
      return `availableItems: [\n${body}\n${row}\n  ],`
    },
  )
  if (replaced === content) {
    throw new Error(`Could not update availableItems in ${shopPath}`)
  }

  await writeFile(shopPath, replaced, "utf8")
  return true
}

async function appendStartupGuyItem(
  shopsIndexPath: string,
  variableName: string,
  coinValue: number,
): Promise<boolean> {
  const content = await readFile(shopsIndexPath, "utf8")
  const itemExpression = `{ shortId: items.${variableName}.shortId, coinValue: ${coinValue} }`
  if (content.includes(itemExpression)) return false

  const replaced = content.replace(
    /shopId:\s*"startup-guy"([\s\S]*?)availableItems:\s*\[(.*?)\],/s,
    (_match, prefix: string, list: string) => {
      const trimmed = list.trim()
      const nextList = trimmed.length > 0 ? `${trimmed}, ${itemExpression}` : itemExpression
      return `shopId: "startup-guy"${prefix}availableItems: [${nextList}],`
    },
  )
  if (replaced === content) {
    throw new Error(`Could not update startup-guy availableItems in ${shopsIndexPath}`)
  }

  await writeFile(shopsIndexPath, replaced, "utf8")
  return true
}

function buildItemFile(answers: ItemWizardAnswers): string {
  const imports: string[] = []
  const lines: string[] = []

  if (answers.behaviorKind === "timedModifier" && answers.timedModifier) {
    const flagImports = answers.timedModifier.effects
      .map((effect) => effect.flagConstName)
      .filter((value): value is string => Boolean(value))
    const uniqueFlagImports = [...new Set(flagImports)]
    if (uniqueFlagImports.length > 0) {
      imports.push(`import { ${uniqueFlagImports.join(", ")} } from "@repo/plugin-base"`)
    }
    imports.push(`import { timedModifierEffect } from "../shared/behaviorHelpers"`)
  } else if (answers.behaviorKind === "passiveDefense") {
    imports.push(`import { usePassiveDefenseItem } from "../shared/behaviorHelpers"`)
  } else if (answers.behaviorKind === "customHandler") {
    imports.push(`import type { ItemDefinition, ItemUseResult } from "@repo/types"`)
    imports.push(`import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"`)
    imports.push(`import { type ItemShopsBehaviorDeps, createItem } from "../shared/types"`)
  }

  if (answers.behaviorKind !== "customHandler") {
    imports.push(`import { createItem } from "../shared/types"`)
  }

  lines.push(...imports, "")
  lines.push(`export const ${answers.variableName} = createItem({`)
  lines.push(`  shortId: "${answers.shortId}",`)
  lines.push(`  definition: {`)
  lines.push(`    name: "${escapeDoubleQuotes(answers.name)}",`)
  lines.push(`    description: "${escapeDoubleQuotes(answers.description)}",`)
  lines.push(`    stackable: ${answers.stackable},`)
  lines.push(`    maxStack: ${answers.maxStack},`)
  lines.push(`    tradeable: ${answers.tradeable},`)
  lines.push(`    consumable: ${answers.consumable},`)
  if (answers.requiresTarget) {
    lines.push(`    requiresTarget: "${answers.requiresTarget}",`)
  }
  lines.push(`    coinValue: ${answers.coinValue},`)
  lines.push(`    icon: "${answers.icon}",`)
  lines.push(`    rarity: "${answers.rarity}",`)

  if (answers.behaviorKind === "passiveDefense" && answers.passiveDefense) {
    lines.push(`    defense: {`)
    lines.push(`      targeting: {`)
    lines.push(`        intents: ${toArrayLiteral(answers.passiveDefense.intents)},`)
    if (answers.passiveDefense.sourcePlugins.length > 0) {
      lines.push(`        sourcePlugins: ${toArrayLiteral(answers.passiveDefense.sourcePlugins)},`)
    }
    lines.push(`      },`)
    lines.push(`      scope: ${toArrayLiteral(answers.passiveDefense.scope)},`)
    lines.push(`    },`)
  }

  lines.push(`  },`)

  if (answers.behaviorKind === "timedModifier" && answers.timedModifier) {
    lines.push(`  use: timedModifierEffect({`)
    lines.push(`    modifierName: "${escapeDoubleQuotes(answers.timedModifier.modifierName)}",`)
    if (answers.timedModifier.visibility === "self") {
      lines.push(`    visibility: "self",`)
    }
    lines.push(`    effects: [`)
    for (const effect of answers.timedModifier.effects) {
      lines.push(`      ${buildTimedEffectLiteral(effect)},`)
    }
    lines.push(`    ],`)
    lines.push(`    successMessage: "${escapeDoubleQuotes(answers.timedModifier.successMessage)}",`)
    lines.push(`    describe: ({ isSelf, actor, target }) =>`)
    lines.push(
      `      isSelf ? \`\${actor} used ${escapeTemplateLiteral(answers.name)} on themselves\` : \`\${actor} used ${escapeTemplateLiteral(answers.name)} on \${target}\`,`,
    )
    lines.push(`  }),`)
  } else if (answers.behaviorKind === "passiveDefense") {
    lines.push(`  use: usePassiveDefenseItem,`)
  } else if (answers.behaviorKind === "customHandler") {
    lines.push(`  use: async (`)
    lines.push(`    deps: ItemShopsBehaviorDeps,`)
    lines.push(`    userId: string,`)
    lines.push(`    definition: ItemDefinition,`)
    lines.push(`    _callContext?: unknown,`)
    lines.push(`  ): Promise<ItemUseResult> => {`)
    lines.push(`    const displayName = await resolveItemUseActorDisplayName(deps, userId)`)
    lines.push(`    // Room \`sendSystemMessage\` lines must use \`displayName\`, not raw usernames.`)
    lines.push(
      `    return { success: false, consumed: false, message: \`TODO: implement custom behavior (\${displayName} / \${definition.name}).\` }`,
    )
    lines.push(`  },`)
  }

  lines.push(`})`, "")
  return lines.join("\n")
}

function buildTestFile(answers: ItemWizardAnswers): string {
  return [
    `import { describe, expect, it } from "vitest"`,
    `import { ${answers.variableName} } from "."`,
    ``,
    `describe("${answers.shortId}", () => {`,
    `  it("registers the expected shortId", () => {`,
    `    expect(${answers.variableName}.shortId).toBe("${answers.shortId}")`,
    `  })`,
    `})`,
    ``,
  ].join("\n")
}

function toArrayLiteral(values: string[]): string {
  return `[${values.map((value) => `"${escapeDoubleQuotes(value)}"`).join(", ")}]`
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function escapeTemplateLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`")
}

function buildTimedEffectLiteral(effect: TimedModifierEffectConfig): string {
  const baseIcon = effect.icon ? `, icon: "${escapeDoubleQuotes(effect.icon)}"` : ""
  const duration = `, durationMs: ${effect.durationMs}`
  if (effect.type === "flag") {
    const constName = effect.flagConstName ?? "GROW_FLAG"
    return `{ type: "flag", name: ${constName}, value: true${baseIcon}, intent: "${effect.intent}"${duration} }`
  }

  const target = effect.target ?? "score"
  const value = effect.value ?? (effect.type === "multiplier" ? 1 : 0)
  return `{ type: "${effect.type}", target: "${target}", value: ${value}${baseIcon}, intent: "${effect.intent}"${duration} }`
}

async function appendGameLogicFlags(
  path: string,
  declarations: NewFlagDeclaration[],
): Promise<boolean> {
  let content = await readFile(path, "utf8")
  let changed = false
  for (const declaration of declarations) {
    const line = `export const ${declaration.constName} = "${declaration.value}"`
    if (!content.includes(line)) {
      content = content.replace(
        'export const COMIC_SANS_FLAG = "comic_sans"',
        `export const COMIC_SANS_FLAG = "comic_sans"\n${line}`,
      )
      changed = true
    }
  }
  if (changed) await writeFile(path, content, "utf8")
  return changed
}

async function appendPluginBaseFlagsReExport(
  path: string,
  declarations: NewFlagDeclaration[],
): Promise<boolean> {
  let content = await readFile(path, "utf8")
  let changed = false
  for (const declaration of declarations) {
    const exportLine = `  ${declaration.constName},`
    if (!content.includes(exportLine)) {
      content = content.replace("  COMIC_SANS_FLAG,", `  COMIC_SANS_FLAG,\n${exportLine}`)
      changed = true
    }
  }
  if (changed) await writeFile(path, content, "utf8")
  return changed
}

async function appendPluginBaseIndexReExport(
  path: string,
  declarations: NewFlagDeclaration[],
): Promise<boolean> {
  let content = await readFile(path, "utf8")
  let changed = false
  for (const declaration of declarations) {
    const exportLine = `  ${declaration.constName},`
    if (!content.includes(exportLine)) {
      content = content.replace("  COMIC_SANS_FLAG,", `  COMIC_SANS_FLAG,\n${exportLine}`)
      changed = true
    }
  }
  if (changed) await writeFile(path, content, "utf8")
  return changed
}
