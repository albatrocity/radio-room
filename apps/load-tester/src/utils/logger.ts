import chalk from "chalk"

export type LogLevel = "debug" | "info" | "warn" | "error" | "success"

let verboseMode = false

export function setVerbose(verbose: boolean) {
  verboseMode = verbose
}

export function log(level: LogLevel, message: string, context?: string) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12)
  const prefix = context ? `[${context}]` : ""

  switch (level) {
    case "debug":
      if (verboseMode) {
        console.log(chalk.gray(`${timestamp} ${prefix} ${message}`))
      }
      break
    case "info":
      console.log(chalk.blue(`${timestamp} ${prefix} ${message}`))
      break
    case "warn":
      console.log(chalk.yellow(`${timestamp} ${prefix} ⚠ ${message}`))
      break
    case "error":
      console.log(chalk.red(`${timestamp} ${prefix} ✖ ${message}`))
      break
    case "success":
      console.log(chalk.green(`${timestamp} ${prefix} ✔ ${message}`))
      break
  }
}

export const logger = {
  debug: (message: string, context?: string) => log("debug", message, context),
  info: (message: string, context?: string) => log("info", message, context),
  warn: (message: string, context?: string) => log("warn", message, context),
  error: (message: string, context?: string) => log("error", message, context),
  success: (message: string, context?: string) => log("success", message, context),
}

