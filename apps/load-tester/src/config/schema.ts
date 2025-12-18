import { z } from "zod"

// Distribution patterns for actions
export const distributionSchema = z.enum(["even", "random", "burst"])
export type Distribution = z.infer<typeof distributionSchema>

// Join patterns for users
export const joinPatternSchema = z.enum(["staggered", "burst"])
export type JoinPattern = z.infer<typeof joinPatternSchema>

// Reaction target types
export const reactionTargetTypeSchema = z.enum(["message", "track"])
export type ReactionTargetType = z.infer<typeof reactionTargetTypeSchema>

// Queue songs action configuration
export const queueSongsActionSchema = z.object({
  enabled: z.boolean().default(true),
  totalSongs: z.number().min(1).default(10),
  trackIds: z.array(z.string()).min(1),
  distribution: distributionSchema.default("even"),
})
export type QueueSongsAction = z.infer<typeof queueSongsActionSchema>

// Send messages action configuration
export const sendMessagesActionSchema = z.object({
  enabled: z.boolean().default(true),
  messagesPerUser: z.number().min(1).default(3),
  content: z.array(z.string()).optional(),
  distribution: distributionSchema.default("random"),
})
export type SendMessagesAction = z.infer<typeof sendMessagesActionSchema>

// Reactions action configuration
export const reactionsActionSchema = z.object({
  enabled: z.boolean().default(true),
  reactionsPerUser: z.number().min(1).default(2),
  targetTypes: z.array(reactionTargetTypeSchema).default(["message", "track"]),
  emojis: z.array(z.string()).default(["👍", "❤️", "🔥", "😂", "🎵"]),
  distribution: distributionSchema.default("random"),
})
export type ReactionsAction = z.infer<typeof reactionsActionSchema>

// All actions configuration
export const actionsSchema = z.object({
  queueSongs: queueSongsActionSchema.optional(),
  sendMessages: sendMessagesActionSchema.optional(),
  reactions: reactionsActionSchema.optional(),
})
export type ActionsConfig = z.infer<typeof actionsSchema>

// Users configuration
export const usersConfigSchema = z.object({
  count: z.number().min(1).default(5),
  joinPattern: joinPatternSchema.default("staggered"),
  joinDuration: z.number().min(0).default(10), // seconds to spread joins over
  leaveAfterActions: z.boolean().default(false), // Leave after completing actions
  stayDuration: z.number().optional(), // Optional duration to stay (seconds)
})
export type UsersConfig = z.infer<typeof usersConfigSchema>

// Full scenario configuration
export const scenarioConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  target: z.string().url(),
  roomId: z.string(),
  password: z.string().optional(),
  duration: z.number().min(1).default(60), // seconds
  users: usersConfigSchema,
  actions: actionsSchema.default({}),
  verbose: z.boolean().default(false),
})
export type ScenarioConfig = z.infer<typeof scenarioConfigSchema>

// Inline CLI configuration (subset of scenario)
export const inlineConfigSchema = z.object({
  target: z.string().url(),
  roomId: z.string(),
  password: z.string().optional(),
  users: z.number().min(1).default(5),
  duration: z.number().min(1).default(60),
  joinPattern: joinPatternSchema.default("staggered"),
  verbose: z.boolean().default(false),
})
export type InlineConfig = z.infer<typeof inlineConfigSchema>

/**
 * Convert inline CLI config to full scenario config
 */
export function inlineToScenario(inline: InlineConfig): ScenarioConfig {
  return {
    name: "inline-test",
    target: inline.target,
    roomId: inline.roomId,
    password: inline.password,
    duration: inline.duration,
    verbose: inline.verbose,
    users: {
      count: inline.users,
      joinPattern: inline.joinPattern,
      joinDuration: Math.min(30, inline.duration / 2),
      leaveAfterActions: false,
    },
    actions: {
      sendMessages: {
        enabled: true,
        messagesPerUser: 3,
        distribution: "random",
      },
    },
  }
}

