#!/usr/bin/env node

import { Command } from "commander"
import chalk from "chalk"
import { existsSync } from "fs"
import { resolve } from "path"

import { ScenarioRunner } from "./ScenarioRunner.js"
import { inlineToScenario, inlineConfigSchema } from "./config/schema.js"
import { logger, setVerbose } from "./utils/logger.js"

const program = new Command()

program
  .name("load-tester")
  .description("Load testing tool for Listening Room - simulates multiple users")
  .version("1.0.0")

program
  .command("run")
  .description("Run a load test scenario")
  .option("-s, --scenario <file>", "Path to scenario YAML file")
  .option("-t, --target <url>", "Target server URL (overrides scenario)")
  .option("-r, --room <id>", "Room ID to join (overrides scenario)")
  .option("-p, --password <password>", "Room password (overrides scenario)")
  .option("-u, --users <count>", "Number of users to simulate (overrides scenario)", parseInt)
  .option("-d, --duration <seconds>", "Test duration in seconds (overrides scenario)", parseInt)
  .option("--join-pattern <pattern>", "User join pattern: staggered or burst", "staggered")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (options) => {
    try {
      let runner: ScenarioRunner

      if (options.scenario) {
        // Load from scenario file
        const scenarioPath = resolve(process.cwd(), options.scenario)

        if (!existsSync(scenarioPath)) {
          logger.error(`Scenario file not found: ${scenarioPath}`)
          process.exit(1)
        }

        // Load scenario and apply CLI overrides
        const baseRunner = ScenarioRunner.fromFile(scenarioPath)
        const overrides: Record<string, unknown> = {}

        if (options.target) overrides.target = options.target
        if (options.room) overrides.roomId = options.room
        if (options.password) overrides.password = options.password
        if (options.duration) overrides.duration = options.duration
        if (options.verbose) overrides.verbose = options.verbose
        if (options.users) {
          overrides.users = { count: options.users }
        }

        runner = ScenarioRunner.fromFileWithOverrides(scenarioPath, overrides)
      } else if (options.target && options.room) {
        // Create from inline options
        const inlineConfig = inlineConfigSchema.parse({
          target: options.target,
          roomId: options.room,
          password: options.password,
          users: options.users || 5,
          duration: options.duration || 60,
          joinPattern: options.joinPattern || "staggered",
          verbose: options.verbose || false,
        })

        const scenarioConfig = inlineToScenario(inlineConfig)
        runner = ScenarioRunner.fromConfig(scenarioConfig)
      } else {
        console.log()
        console.log(chalk.yellow("Please provide either a --scenario file or --target and --room options."))
        console.log()
        console.log(chalk.gray("Examples:"))
        console.log(chalk.gray("  npx load-tester run --scenario scenarios/queue-stress.yaml"))
        console.log(chalk.gray("  npx load-tester run --scenario scenarios/queue-stress.yaml --target http://prod.example.com --room my-room"))
        console.log(chalk.gray("  npx load-tester run --target http://localhost:3000 --room test-room --users 10"))
        console.log()
        process.exit(1)
      }

      if (options.verbose) {
        setVerbose(true)
      }

      const summary = await runner.run()

      // Exit with error code if there were failures
      if (summary.failedActions > 0 && summary.failedActions > summary.successfulActions * 0.1) {
        process.exit(1)
      }
    } catch (error) {
      logger.error(`Failed to run scenario: ${error instanceof Error ? error.message : "Unknown error"}`)
      if (options.verbose && error instanceof Error) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

program
  .command("validate")
  .description("Validate a scenario YAML file without running it")
  .argument("<file>", "Path to scenario YAML file")
  .action((file) => {
    try {
      const scenarioPath = resolve(process.cwd(), file)

      if (!existsSync(scenarioPath)) {
        logger.error(`Scenario file not found: ${scenarioPath}`)
        process.exit(1)
      }

      // This will throw if invalid
      ScenarioRunner.fromFile(scenarioPath)

      logger.success(`Scenario file is valid: ${file}`)
    } catch (error) {
      logger.error(`Invalid scenario: ${error instanceof Error ? error.message : "Unknown error"}`)
      process.exit(1)
    }
  })

program
  .command("init")
  .description("Create a sample scenario YAML file")
  .argument("[file]", "Output file path", "scenario.yaml")
  .action((file) => {
    const { writeFileSync } = require("fs")

    const sampleScenario = `# Listening Room Load Test Scenario
name: "sample-test"
description: "A sample load test scenario"
target: "http://localhost:3000"
roomId: "test-room"
# password: "optional-room-password"
duration: 60  # seconds
verbose: false

users:
  count: 5
  joinPattern: "staggered"  # or "burst"
  joinDuration: 10  # seconds to spread joins over
  leaveAfterActions: false

actions:
  sendMessages:
    enabled: true
    messagesPerUser: 3
    content:
      - "Hello everyone!"
      - "Great song! 🎵"
      - "This is awesome"
    distribution: "random"  # or "even", "burst"

  # queueSongs:
  #   enabled: true
  #   totalSongs: 10
  #   trackIds:
  #     - "4iV5W9uYEdYUVa79Axb7Rh"
  #     - "1301WleyT98MSxVHPZCA6M"
  #   distribution: "even"

  # reactions:
  #   enabled: true
  #   reactionsPerUser: 2
  #   targetTypes:
  #     - "message"
  #     - "track"
  #   emojis:
  #     - "👍"
  #     - "❤️"
  #     - "🔥"
  #   distribution: "random"
`

    const outputPath = resolve(process.cwd(), file)
    writeFileSync(outputPath, sampleScenario)
    logger.success(`Created sample scenario: ${file}`)
    console.log()
    console.log(chalk.gray(`Edit the file and run with:`))
    console.log(chalk.cyan(`  npx load-tester run --scenario ${file}`))
    console.log()
  })

// Default command
program
  .action(() => {
    program.help()
  })

program.parse()

