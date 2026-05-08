import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ShopWizardAnswers } from "./shop-prompts"

export async function generateShopScaffold(
  packageDir: string,
  answers: ShopWizardAnswers,
): Promise<string[]> {
  const changedFiles: string[] = []
  const shopDir = join(packageDir, "shops", answers.shopId)
  const shopIndexFile = join(shopDir, "index.ts")
  const shopsIndexFile = join(packageDir, "shops", "index.ts")

  await mkdir(shopDir, { recursive: true })

  await writeFile(shopIndexFile, buildShopIndexFile(answers), "utf8")
  changedFiles.push(shopIndexFile)

  const updatedCatalog = await updateShopsCatalogIndex(shopsIndexFile, answers)
  if (updatedCatalog) {
    changedFiles.push(shopsIndexFile)
  }

  return changedFiles
}

function buildShopIndexFile(answers: ShopWizardAnswers): string {
  const lines: string[] = []
  lines.push('import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"')
  lines.push('import { items } from "../../items"')
  lines.push("")
  lines.push(`function ${answers.onBuyHandlerName}(_ctx: ShopBuyContext): void {`)
  lines.push(`  // TODO: Implement purchase side effects (state, timers, messages).`)
  lines.push("}")
  lines.push("")
  lines.push(`export const ${answers.shopConstName}: ItemShopsShopCatalogEntry = {`)
  lines.push(`  shopId: "${answers.shopId}",`)
  lines.push(`  name: "${escapeDoubleQuotes(answers.name)}",`)
  if (answers.openingMessage) {
    lines.push(`  openingMessage: "${escapeDoubleQuotes(answers.openingMessage)}",`)
  }
  lines.push("  availableItems: [")
  for (const item of answers.availableItems) {
    lines.push(`    { shortId: items.${item.variableName}.shortId, coinValue: ${item.coinValue} },`)
  }
  lines.push("  ],")
  lines.push(`  listedBuybackRate: ${answers.listedBuybackRate},`)
  lines.push(`  unlistedBuybackRate: ${answers.unlistedBuybackRate},`)
  lines.push(`  onBuy: ${answers.onBuyHandlerName},`)
  lines.push("}")
  lines.push("")
  return lines.join("\n")
}

async function updateShopsCatalogIndex(
  shopsIndexFile: string,
  answers: ShopWizardAnswers,
): Promise<boolean> {
  let content = await readFile(shopsIndexFile, "utf8")
  let changed = false

  const importLine = `import { ${answers.shopConstName} } from "./${answers.shopId}"`
  if (!content.includes(importLine)) {
    const marker = /import\s+\{\s*GREEN_ROOM_SHOP\s*\}\s+from\s+"\.\/green-room"/
    content = content.replace(marker, (match) => `${match}\n${importLine}`)
    changed = true
  }

  const catalogEntry = `  ${answers.shopConstName},`
  if (!content.includes(catalogEntry)) {
    content = content.replace(/\]\s*$/, `${catalogEntry}\n]`)
    changed = true
  }

  if (changed) {
    await writeFile(shopsIndexFile, content, "utf8")
  }
  return changed
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
