import { AppContext, JobRegistration, SimpleCache } from "@repo/types"
import * as cron from "node-cron"

export class JobService {
  private scheduledJobs: Map<string, ReturnType<typeof cron.schedule>> = new Map()
  private context: AppContext
  private cache: SimpleCache

  constructor(context: AppContext, cache: SimpleCache) {
    this.context = context
    this.cache = cache
  }

  /**
   * Start all registered jobs
   */
  async start() {
    console.log(`Starting JobService with ${this.context.jobs.length} jobs`)

    for (const job of this.context.jobs) {
      if (job.enabled) {
        this.scheduleJob(job)
      }
    }
  }

  /**
   * Schedule a single job
   */
  async scheduleJob(job: JobRegistration) {
    try {
      // Validate cron expression
      if (!cron.validate(job.cron)) {
        console.error(`Invalid cron expression for job ${job.name}: ${job.cron}`)
        return
      }

      // Check if job is already scheduled - if so, skip
      if (this.scheduledJobs.has(job.name)) {
        console.log(`Job ${job.name} is already scheduled, skipping duplicate registration`)
        return
      }

      // Add job to context.jobs array if not already present
      const existingJob = this.context.jobs.find((j) => j.name === job.name)
      if (!existingJob) {
        this.context.jobs.push(job)
      }

      console.log(`Scheduling job: ${job.name} (${job.description}) with cron: ${job.cron}`)

      const task = cron.schedule(job.cron, async () => {
        try {
          console.log(`Running job: ${job.name}`)
          await job.handler({ cache: this.cache, context: this.context })
        } catch (error) {
          console.error(`Error running job ${job.name}:`, error)
        }
      })

      task.start()

      this.scheduledJobs.set(job.name, task)

      // If the job has a runAt time in the past or near future, run it immediately
      if (job.runAt && job.runAt <= Date.now() + 5000) {
        console.log(`Running job ${job.name} immediately`)
        job.handler({ cache: this.cache, context: this.context }).catch((error) => {
          console.error(`Error running job ${job.name} on startup:`, error)
        })
      }
    } catch (error) {
      console.error(`Error scheduling job ${job.name}:`, error)
    }
  }

  /**
   * Stop all scheduled jobs
   */
  async stop() {
    console.log("Stopping JobService")
    for (const [name, task] of this.scheduledJobs.entries()) {
      task.stop()
      console.log(`Stopped job: ${name}`)
    }
    this.scheduledJobs.clear()
  }

  /**
   * Enable a job by name
   */
  enableJob(jobName: string) {
    const job = this.context.jobs.find((j) => j.name === jobName)
    if (job) {
      job.enabled = true
      if (!this.scheduledJobs.has(jobName)) {
        this.scheduleJob(job)
      }
    }
  }

  /**
   * Disable a job by name
   */
  disableJob(jobName: string) {
    const job = this.context.jobs.find((j) => j.name === jobName)
    if (job) {
      job.enabled = false
      const task = this.scheduledJobs.get(jobName)
      if (task) {
        task.stop()
        this.scheduledJobs.delete(jobName)
      }
    }
  }

  /**
   * Get job status
   */
  getJobStatus() {
    return this.context.jobs.map((job) => ({
      name: job.name,
      description: job.description,
      cron: job.cron,
      enabled: job.enabled,
      scheduled: this.scheduledJobs.has(job.name),
    }))
  }
}

