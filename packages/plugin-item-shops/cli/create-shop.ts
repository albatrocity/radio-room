#!/usr/bin/env node

import chalk from "chalk"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { generateShopScaffold } from "./shop-generators"
import { promptForShopConfig, type ShopPromptItemOption } from "./shop-prompts"

async function main(): Promise<void> {
  const packageDir = resolvePackageDir()
  const existingShopIds = await readExistingShopIds(packageDir)
  const availableItems = await readAvailableItems(packageDir)

  console.log(chalk.cyan("\nItem Shops Shop Wizard\n"))
  console.log(chalk.gray("Guided setup for shop definition and SHOP_CATALOG registration.\n"))

  const answers = await promptForShopConfig({
    existingShopIds,
    items: availableItems,
  })

  const changedFiles = await generateShopScaffold(packageDir, answers)

  console.log(chalk.green("\nShop scaffold created successfully.\n"))
  for (const file of changedFiles) {
    const relative = file.replace(`${packageDir}/`, "")
    console.log(chalk.gray(`- ${relative}`))
  }
  console.log()
  console.log(chalk.cyan("Next steps:"))
  console.log(chalk.gray("- Implement onBuy logic if this shop needs side effects."))
  console.log(chalk.gray("- Add tests if onBuy behavior becomes non-trivial."))
  console.log(chalk.gray("- Run: npm test -w @repo/plugin-item-shops"))
  console.log()
}

async function readExistingShopIds(packageDir: string): Promise<Set<string>> {
  const shopsDir = join(packageDir, "shops")
  const dirEntries = await readdir(shopsDir, { withFileTypes: true })
  const fromDirs = dirEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const shopsIndexPath = join(shopsDir, "index.ts")
  const shopsIndexContent = await readFile(shopsIndexPath, "utf8")
  const fromCatalog = [...shopsIndexContent.matchAll(/shopId:\s*"([^"]+)"/g)].map((m) => m[1])

  return new Set([...fromDirs, ...fromCatalog])
}

async function readAvailableItems(packageDir: string): Promise<ShopPromptItemOption[]> {
  const itemsIndexPath = join(packageDir, "items", "index.ts")
  const content = await readFile(itemsIndexPath, "utf8")
  const objectMatch = content.match(/export const items = \{([\s\S]*?)\} as const/)
  if (!objectMatch) {
    throw new Error("Could not parse items registry from items/index.ts")
  }

  return objectMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(","))
    .map((line) => line.slice(0, -1))
    .filter((line) => line.length > 0)
    .map((variableName) => ({
      variableName,
      label: `${variableName} (items.${variableName}.shortId)`,
    }))
}

function resolvePackageDir(): string {
  const currentFile = fileURLToPath(import.meta.url)
  return dirname(dirname(currentFile))
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(chalk.red(`\nFailed to create shop scaffold: ${message}\n`))
  process.exitCode = 1
})
