export interface ActionMetric {
  action: string
  userId: string
  timestamp: number
  duration?: number
  success: boolean
  error?: string
}

export interface MetricsSummary {
  totalActions: number
  successfulActions: number
  failedActions: number
  averageDuration: number
  actionBreakdown: Record<string, { count: number; successes: number; failures: number; avgDuration: number }>
  errors: string[]
}

export class MetricsCollector {
  private metrics: ActionMetric[] = []
  private startTime: number = Date.now()

  start() {
    this.startTime = Date.now()
    this.metrics = []
  }

  record(metric: ActionMetric) {
    this.metrics.push(metric)
  }

  getSummary(): MetricsSummary {
    const actionBreakdown: MetricsSummary["actionBreakdown"] = {}
    const errors: string[] = []

    for (const metric of this.metrics) {
      if (!actionBreakdown[metric.action]) {
        actionBreakdown[metric.action] = { count: 0, successes: 0, failures: 0, avgDuration: 0 }
      }

      const breakdown = actionBreakdown[metric.action]
      breakdown.count++

      if (metric.success) {
        breakdown.successes++
        if (metric.duration) {
          breakdown.avgDuration =
            (breakdown.avgDuration * (breakdown.successes - 1) + metric.duration) / breakdown.successes
        }
      } else {
        breakdown.failures++
        if (metric.error) {
          errors.push(`[${metric.action}] ${metric.error}`)
        }
      }
    }

    const successfulActions = this.metrics.filter((m) => m.success).length
    const durations = this.metrics.filter((m) => m.duration).map((m) => m.duration!)
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    return {
      totalActions: this.metrics.length,
      successfulActions,
      failedActions: this.metrics.length - successfulActions,
      averageDuration,
      actionBreakdown,
      errors: [...new Set(errors)].slice(0, 20), // Dedupe and limit errors
    }
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime
  }
}

