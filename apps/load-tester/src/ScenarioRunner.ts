import { readFileSync } from "fs"
import { parse as parseYaml } from "yaml"
import chalk from "chalk"

import { UserPool } from "./UserPool.js"
import { MetricsCollector, MetricsSummary } from "./utils/metrics.js"
import { logger, setVerbose } from "./utils/logger.js"
import { calculateActionTimes, sleep } from "./utils/random.js"
import { createQueueSongAction } from "./actions/queueSong.js"
import { createSendMessageAction } from "./actions/sendMessage.js"
import { createAddReactionAction } from "./actions/addReaction.js"
import { scenarioConfigSchema, type ScenarioConfig, type Distribution } from "./config/schema.js"

interface ScheduledAction {
  time: number // ms from start
  action: () => Promise<void>
  name: string
}

export class ScenarioRunner {
  private config: ScenarioConfig
  private userPool: UserPool | null = null
  private metrics: MetricsCollector
  private aborted: boolean = false

  constructor(config: ScenarioConfig) {
    this.config = config
    this.metrics = new MetricsCollector()

    if (config.verbose) {
      setVerbose(true)
    }
  }

  /**
   * Load and validate a scenario from a YAML file
   */
  static fromFile(filePath: string): ScenarioRunner {
    logger.info(`Loading scenario from ${filePath}`)

    const fileContents = readFileSync(filePath, "utf-8")
    const rawConfig = parseYaml(fileContents)

    const result = scenarioConfigSchema.safeParse(rawConfig)
    if (!result.success) {
      const errors = result.error.errors.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n")
      throw new Error(`Invalid scenario configuration:\n${errors}`)
    }

    return new ScenarioRunner(result.data)
  }

  /**
   * Load a scenario from a YAML file with CLI overrides
   */
  static fromFileWithOverrides(filePath: string, overrides: Record<string, unknown>): ScenarioRunner {
    logger.info(`Loading scenario from ${filePath}`)

    const fileContents = readFileSync(filePath, "utf-8")
    const rawConfig = parseYaml(fileContents) as Record<string, unknown>

    // Deep merge overrides into raw config
    const mergedConfig = { ...rawConfig }

    for (const [key, value] of Object.entries(overrides)) {
      if (key === "users" && typeof value === "object" && value !== null) {
        // Merge users object
        mergedConfig.users = {
          ...(rawConfig.users as Record<string, unknown> || {}),
          ...value,
        }
      } else {
        mergedConfig[key] = value
      }
    }

    const result = scenarioConfigSchema.safeParse(mergedConfig)
    if (!result.success) {
      const errors = result.error.errors.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n")
      throw new Error(`Invalid scenario configuration:\n${errors}`)
    }

    // Log overrides that were applied
    const appliedOverrides = Object.keys(overrides).filter((k) => overrides[k] !== undefined)
    if (appliedOverrides.length > 0) {
      logger.info(`Applied CLI overrides: ${appliedOverrides.join(", ")}`)
    }

    return new ScenarioRunner(result.data)
  }

  /**
   * Create a runner from a config object
   */
  static fromConfig(config: ScenarioConfig): ScenarioRunner {
    return new ScenarioRunner(config)
  }

  /**
   * Run the scenario
   */
  async run(): Promise<MetricsSummary> {
    this.printHeader()
    this.metrics.start()

    try {
      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers()

      // Create user pool
      this.userPool = new UserPool(
        {
          target: this.config.target,
          roomId: this.config.roomId,
          password: this.config.password,
          count: this.config.users.count,
          joinPattern: this.config.users.joinPattern,
          joinDuration: this.config.users.joinDuration,
        },
        this.metrics
      )

      // Spawn users
      await this.userPool.spawn()

      if (this.aborted) {
        return this.finalize()
      }

      // Schedule and execute actions
      await this.executeActions()

      // Handle user staying/leaving
      if (this.config.users.stayDuration) {
        logger.info(`Waiting ${this.config.users.stayDuration}s before disconnecting...`)
        await sleep(this.config.users.stayDuration * 1000)
      }

      return this.finalize()
    } catch (error) {
      logger.error(`Scenario failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      return this.finalize()
    }
  }

  private async executeActions(): Promise<void> {
    const { actions } = this.config
    const durationMs = this.config.duration * 1000
    const scheduledActions: ScheduledAction[] = []

    // Schedule queue song actions
    if (actions.queueSongs?.enabled && actions.queueSongs.trackIds.length > 0) {
      const times = calculateActionTimes(
        actions.queueSongs.totalSongs,
        durationMs,
        actions.queueSongs.distribution
      )
      const queueAction = createQueueSongAction({ trackIds: actions.queueSongs.trackIds })

      for (const time of times) {
        scheduledActions.push({
          time,
          action: () => this.userPool!.executeOnRandomUser(queueAction),
          name: "queueSong",
        })
      }

      logger.info(
        `Scheduled ${actions.queueSongs.totalSongs} queue actions (${actions.queueSongs.distribution} distribution)`
      )
    }

    // Schedule send message actions
    if (actions.sendMessages?.enabled) {
      const totalMessages = actions.sendMessages.messagesPerUser * this.config.users.count
      const times = calculateActionTimes(totalMessages, durationMs, actions.sendMessages.distribution)
      const messageAction = createSendMessageAction({
        content: actions.sendMessages.content,
        simulateTyping: true,
      })

      for (const time of times) {
        scheduledActions.push({
          time,
          action: () => this.userPool!.executeOnRandomUser(messageAction),
          name: "sendMessage",
        })
      }

      logger.info(
        `Scheduled ${totalMessages} message actions (${actions.sendMessages.distribution} distribution)`
      )
    }

    // Schedule reaction actions
    if (actions.reactions?.enabled) {
      const totalReactions = actions.reactions.reactionsPerUser * this.config.users.count
      const times = calculateActionTimes(totalReactions, durationMs, actions.reactions.distribution)
      const reactionAction = createAddReactionAction({
        targetTypes: actions.reactions.targetTypes,
        emojis: actions.reactions.emojis,
      })

      for (const time of times) {
        scheduledActions.push({
          time,
          action: () => this.userPool!.executeOnRandomUser(reactionAction),
          name: "addReaction",
        })
      }

      logger.info(
        `Scheduled ${totalReactions} reaction actions (${actions.reactions.distribution} distribution)`
      )
    }

    // Sort all actions by time
    scheduledActions.sort((a, b) => a.time - b.time)

    if (scheduledActions.length === 0) {
      logger.info(`No actions scheduled, waiting ${this.config.duration}s...`)
      await sleep(durationMs)
      return
    }

    logger.info(`Executing ${scheduledActions.length} total actions over ${this.config.duration}s...`)

    // Execute actions
    const startTime = Date.now()
    for (const scheduled of scheduledActions) {
      if (this.aborted) break

      const waitTime = scheduled.time - (Date.now() - startTime)
      if (waitTime > 0) {
        await sleep(waitTime)
      }

      if (this.aborted) break

      try {
        await scheduled.action()
      } catch (error) {
        // Actions handle their own errors
      }
    }

    // Wait for remaining duration
    const elapsed = Date.now() - startTime
    const remaining = durationMs - elapsed
    if (remaining > 0 && !this.aborted) {
      logger.debug(`Waiting ${Math.round(remaining / 1000)}s for scenario to complete...`)
      await sleep(remaining)
    }
  }

  private async finalize(): Promise<MetricsSummary> {
    // Disconnect all users
    if (this.userPool) {
      await this.userPool.disconnectAll()
    }

    const summary = this.metrics.getSummary()
    this.printSummary(summary)

    return summary
  }

  private setupSignalHandlers(): void {
    const gracefulShutdown = async () => {
      if (this.aborted) return
      this.aborted = true
      logger.warn("Received shutdown signal, cleaning up...")
    }

    process.on("SIGINT", gracefulShutdown)
    process.on("SIGTERM", gracefulShutdown)
  }

  private printHeader(): void {
    console.log()
    console.log(chalk.bold.cyan("═".repeat(60)))
    console.log(chalk.bold.cyan("  Listening Room Load Tester"))
    console.log(chalk.bold.cyan("═".repeat(60)))
    console.log()
    console.log(chalk.white(`  Scenario:    ${chalk.bold(this.config.name)}`))
    console.log(chalk.white(`  Target:      ${this.config.target}`))
    console.log(chalk.white(`  Room:        ${this.config.roomId}`))
    console.log(chalk.white(`  Users:       ${this.config.users.count}`))
    console.log(chalk.white(`  Duration:    ${this.config.duration}s`))
    console.log()
    console.log(chalk.gray("─".repeat(60)))
    console.log()
  }

  private printSummary(summary: MetricsSummary): void {
    const elapsed = Math.round(this.metrics.getElapsedTime() / 1000)

    console.log()
    console.log(chalk.gray("─".repeat(60)))
    console.log()
    console.log(chalk.bold.cyan("  Summary"))
    console.log()
    console.log(chalk.white(`  Duration:          ${elapsed}s`))
    console.log(chalk.white(`  Total Actions:     ${summary.totalActions}`))
    console.log(chalk.green(`  Successful:        ${summary.successfulActions}`))
    console.log(chalk.red(`  Failed:            ${summary.failedActions}`))

    if (summary.averageDuration > 0) {
      console.log(chalk.white(`  Avg Duration:      ${Math.round(summary.averageDuration)}ms`))
    }

    console.log()
    console.log(chalk.bold("  Action Breakdown:"))
    for (const [action, stats] of Object.entries(summary.actionBreakdown)) {
      const successRate = stats.count > 0 ? Math.round((stats.successes / stats.count) * 100) : 0
      const color = successRate >= 90 ? chalk.green : successRate >= 50 ? chalk.yellow : chalk.red
      console.log(
        chalk.white(`    ${action}: `) +
          color(`${stats.successes}/${stats.count} (${successRate}%)`) +
          (stats.avgDuration > 0 ? chalk.gray(` avg ${Math.round(stats.avgDuration)}ms`) : "")
      )
    }

    if (summary.errors.length > 0) {
      console.log()
      console.log(chalk.bold.red("  Errors:"))
      for (const error of summary.errors.slice(0, 10)) {
        console.log(chalk.red(`    • ${error}`))
      }
      if (summary.errors.length > 10) {
        console.log(chalk.gray(`    ... and ${summary.errors.length - 10} more`))
      }
    }

    console.log()
    console.log(chalk.bold.cyan("═".repeat(60)))
    console.log()
  }
}

