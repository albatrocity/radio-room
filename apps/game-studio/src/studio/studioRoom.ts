import type {
  ChatMessage,
  GameAttributeName,
  GameSession,
  GameSessionConfig,
  GameSessionStatus,
  InventoryItem,
  ItemDefinition,
  Poll,
  PollHistoryEntry,
  PollOption,
  PollResults,
  QueueItem,
  Reaction,
  StoredArtifact,
  User,
  UserGameState,
} from "@repo/types"
import type { ReactionSubject } from "@repo/types"
import { initialUserStateForConfig } from "./userStateHelpers"
import { STUDIO_ROOM_ID } from "./constants"

export type StudioEventEntry = { at: number; kind: string; payload: unknown }

export type PluginKvStore = {
  kv: Map<string, string>
  hashes: Map<string, Map<string, string>>
  zsets: Map<string, Map<string, number>>
}

export class StudioRoom {
  readonly roomId = STUDIO_ROOM_ID

  users = new Map<string, User>()
  /** pluginName -> JSON config */
  pluginConfigs = new Map<string, Record<string, unknown>>()
  /** pluginName -> storage buckets */
  pluginStores = new Map<string, PluginKvStore>()

  activeSession: GameSession | null = null
  /** session participants */
  participants = new Set<string>()
  userStates = new Map<string, UserGameState>()
  definitions = new Map<string, ItemDefinition>()
  inventories = new Map<string, InventoryItem[]>()
  /** leaderboardId -> userId -> score */
  leaderboardScores = new Map<string, Map<string, number>>()

  queue: QueueItem[] = []
  chat: ChatMessage[] = []
  events: StudioEventEntry[] = []

  reactions = new Map<string, Reaction[]>()

  /** Global sandbox artifact storage (mirrors production Redis-backed artifacts). */
  storedArtifacts: StoredArtifact[] = []

  activePoll: Poll | null = null
  pollHistory: PollHistoryEntry[] = []
  /** userId -> optionId */
  pollVotes = new Map<string, string>()

  /** Bumped on every `notify()` so `useSyncExternalStore` can subscribe to room mutations. */
  snapshotEpoch = 0

  private listeners = new Set<() => void>()

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  notify(): void {
    this.snapshotEpoch++
    this.listeners.forEach((l) => l())
  }

  logEvent(kind: string, payload: unknown): void {
    this.events.push({ at: Date.now(), kind, payload })
    this.notify()
  }

  ensurePluginStore(pluginName: string): PluginKvStore {
    let s = this.pluginStores.get(pluginName)
    if (!s) {
      s = { kv: new Map(), hashes: new Map(), zsets: new Map() }
      this.pluginStores.set(pluginName, s)
    }
    return s
  }

  addUser(user: User): void {
    this.users.set(user.userId, user)
    this.notify()
  }

  removeUser(userId: string): void {
    this.users.delete(userId)
    this.participants.delete(userId)
    this.notify()
  }

  getPluginConfig(pluginName: string): Record<string, unknown> | null {
    return this.pluginConfigs.get(pluginName) ?? null
  }

  setPluginConfig(pluginName: string, cfg: Record<string, unknown>): void {
    this.pluginConfigs.set(pluginName, cfg)
    this.notify()
  }

  getInventory(userId: string): InventoryItem[] {
    return this.inventories.get(userId) ?? []
  }

  setInventory(userId: string, items: InventoryItem[]): void {
    this.inventories.set(userId, items)
    this.notify()
  }

  getDefinition(definitionId: string): ItemDefinition | null {
    return this.definitions.get(definitionId) ?? null
  }

  registerDefinitions(defs: ItemDefinition[]): void {
    for (const d of defs) {
      this.definitions.set(d.id, d)
    }
    this.notify()
  }

  ensureParticipant(userId: string): void {
    if (!this.activeSession) return
    this.participants.add(userId)
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, initialUserStateForConfig(this.activeSession.config, userId))
    }
    this.notify()
  }

  getUserState(userId: string): UserGameState | null {
    if (!this.activeSession) return null
    const existing = this.userStates.get(userId)
    if (existing) return existing
    const fresh = initialUserStateForConfig(this.activeSession.config, userId)
    this.userStates.set(userId, fresh)
    return fresh
  }

  setUserState(state: UserGameState): void {
    this.userStates.set(state.userId, state)
    this.notify()
  }

  updateLeaderboardScores(leaderboardId: string, userId: string, value: number): void {
    let m = this.leaderboardScores.get(leaderboardId)
    if (!m) {
      m = new Map()
      this.leaderboardScores.set(leaderboardId, m)
    }
    m.set(userId, value)
    this.notify()
  }

  updateLeaderboardScoresForAttribute(
    session: GameSession,
    userId: string,
    attribute: GameAttributeName,
    value: number,
  ): void {
    for (const lb of session.config.leaderboards) {
      if (lb.attribute === attribute) {
        this.updateLeaderboardScores(lb.id, userId, value)
      }
    }
  }

  startSession(config: GameSessionConfig): GameSession {
    const session: GameSession = {
      id: config.id,
      roomId: this.roomId,
      config,
      status: "active" as GameSessionStatus,
      startedAt: Date.now(),
    }
    this.activeSession = session
    this.userStates.clear()
    this.participants.clear()
    this.leaderboardScores.clear()
    for (const uid of this.users.keys()) {
      this.ensureParticipant(uid)
    }
    this.notify()
    return session
  }

  endSession(): void {
    this.activeSession = null
    this.participants.clear()
    this.userStates.clear()
    this.leaderboardScores.clear()
    this.notify()
  }

  appendChat(message: ChatMessage): void {
    this.chat.push(message)
    this.notify()
  }

  reactionKey(roomId: string, reactTo: ReactionSubject): string {
    return `${roomId}:${JSON.stringify(reactTo)}`
  }

  getReactions(roomId: string, reactTo: ReactionSubject): Reaction[] {
    return this.reactions.get(this.reactionKey(roomId, reactTo)) ?? []
  }

  addReaction(roomId: string, reactTo: ReactionSubject, reaction: Reaction): void {
    const k = this.reactionKey(roomId, reactTo)
    const list = this.reactions.get(k) ?? []
    list.push(reaction)
    this.reactions.set(k, list)
    this.notify()
  }

  addStoredArtifact(artifact: StoredArtifact): void {
    this.storedArtifacts.push(artifact)
    this.notify()
  }

  removeStoredArtifact(id: string): boolean {
    const idx = this.storedArtifacts.findIndex((a) => a.id === id)
    if (idx === -1) return false
    this.storedArtifacts.splice(idx, 1)
    this.notify()
    return true
  }

  setActivePoll(poll: Poll | null): void {
    this.activePoll = poll
    if (poll) {
      this.pollVotes.clear()
    }
    this.notify()
  }

  addPollVote(userId: string, optionId: string): void {
    this.pollVotes.set(userId, optionId)
    this.notify()
  }

  clearPollVotes(): void {
    this.pollVotes.clear()
    this.notify()
  }

  closePoll(): PollHistoryEntry | null {
    const poll = this.activePoll
    if (!poll || poll.status !== "open") return null

    const closedAt = Date.now()
    const votes = Object.fromEntries(this.pollVotes)
    const results = reducePollVotesToResults({
      pollId: poll.id,
      options: poll.options,
      votes,
      closedAt,
    })
    const closedPoll: Poll = { ...poll, status: "closed", closedAt }
    const entry: PollHistoryEntry = { poll: closedPoll, results }

    this.pollHistory.unshift(entry)
    this.activePoll = null
    this.pollVotes.clear()
    this.notify()
    return entry
  }

  deletePoll(pollId: string): boolean {
    if (this.activePoll?.id === pollId) {
      this.activePoll = null
      this.pollVotes.clear()
      this.notify()
      return true
    }

    const idx = this.pollHistory.findIndex((entry) => entry.poll.id === pollId)
    if (idx === -1) return false
    this.pollHistory.splice(idx, 1)
    this.notify()
    return true
  }

  /** Snapshot reference used by useSyncExternalStore (mutate in place + notify). */
  getExternalSnapshot(): this {
    return this
  }
}

/** Mirrors `packages/server/operations/data/polls.ts` `reduceVotesToResults`. */
function reducePollVotesToResults({
  pollId,
  options,
  votes,
  closedAt,
}: {
  pollId: string
  options: PollOption[]
  votes: Record<string, string>
  closedAt: number
}): PollResults {
  const optionTallies: Record<string, number> = {}
  for (const option of options) {
    optionTallies[option.id] = 0
  }

  for (const optionId of Object.values(votes)) {
    if (optionId in optionTallies) {
      optionTallies[optionId] += 1
    }
  }

  const totalVotes = Object.values(votes).length
  let winners: string[] = []

  if (totalVotes > 0) {
    const maxCount = Math.max(...Object.values(optionTallies))
    winners = options.filter((o) => optionTallies[o.id] === maxCount).map((o) => o.id)
  }

  return {
    pollId,
    totalVotes,
    optionTallies,
    winners,
    closedAt,
  }
}
