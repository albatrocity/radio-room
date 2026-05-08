#!/usr/bin/env node

import chalk from "chalk"
import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { generateItemScaffold } from "./generators"
import { getLucideIconNames } from "./icons"
import { promptForItemConfig } from "./prompts"

async function main(): Promise<void> {
  const packageDir = resolvePackageDir()
  const existingShortIds = await readExistingShortIds(packageDir)
  const iconNames = getLucideIconNames()

  console.log(chalk.cyan("\nItem Shops Item Wizard\n"))
  console.log(
    chalk.gray("Guided setup for item definition, behavior, catalog, and shop registration.\n"),
  )

  const answers = await promptForItemConfig({
    existingShortIds,
    iconNames,
  })

  const changedFiles = await generateItemScaffold(packageDir, answers)

  console.log(chalk.green("\nItem scaffold created successfully.\n"))
  for (const file of changedFiles) {
    const relative = file.replace(`${packageDir}/`, "")
    console.log(chalk.gray(`- ${relative}`))
  }
  console.log()
  console.log(chalk.cyan("Next steps:"))
  console.log(chalk.gray("- Review generated behavior and tailor system messages if needed."))
  console.log(chalk.gray("- Add or expand tests in the generated test file."))
  console.log(chalk.gray("- Run: npm test -w @repo/plugin-item-shops"))
  console.log()
}

async function readExistingShortIds(packageDir: string): Promise<Set<string>> {
  const itemsDir = join(packageDir, "items")
  const entries = await readdir(itemsDir, { withFileTypes: true })
  const shortIds = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "shared")
  return new Set(shortIds)
}

function resolvePackageDir(): string {
  const currentFile = fileURLToPath(import.meta.url)
  return dirname(dirname(currentFile))
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(chalk.red(`\nFailed to create item scaffold: ${message}\n`))
  process.exitCode = 1
})
