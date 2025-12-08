import type {
  RoomExportData,
  QueueItem,
  ChatMessage,
  User,
  Reaction,
  MetadataSourceType,
} from "@repo/types"
import type { PluginRegistry } from "./plugins/PluginRegistry"

/**
 * Format room export data as a human-readable Markdown document.
 */
export function formatRoomExportAsMarkdown(
  data: RoomExportData,
  pluginMarkdownSections: string[],
  pluginRegistry: PluginRegistry | undefined,
  roomId: string,
): string {
  const sections: string[] = []

  // Header
  sections.push(formatHeader(data))

  // Room Info
  sections.push(formatRoomInfo(data))

  // Users (currently online)
  sections.push(formatUsers(data.users))

  // User History (all unique users who joined)
  if (data.userHistory && data.userHistory.length > 0) {
    sections.push(formatUserHistory(data.userHistory))
  }

  // Playlist
  sections.push(formatPlaylist(data, pluginRegistry, roomId))

  // Chat
  sections.push(formatChat(data, pluginRegistry, roomId))

  // Queue
  if (data.queue.length > 0) {
    sections.push(formatQueue(data, pluginRegistry, roomId))
  }

  // Plugin sections
  if (pluginMarkdownSections.length > 0) {
    sections.push(...pluginMarkdownSections)
  }

  // Footer
  sections.push(formatFooter(data))

  return sections.join("\n\n---\n\n")
}

function formatHeader(data: RoomExportData): string {
  return `# ${data.room.title}

*Exported on ${formatDate(data.exportedAt)}*`
}

function formatRoomInfo(data: RoomExportData): string {
  const lines = ["## Room Info", ""]

  lines.push(`- **Type:** ${data.room.type === "jukebox" ? "Jukebox" : "Radio"}`)
  lines.push(`- **Created:** ${formatDate(data.room.createdAt)}`)

  if (data.room.description) {
    lines.push(`- **Description:** ${data.room.description}`)
  }

  return lines.join("\n")
}

function formatUsers(users: User[]): string {
  if (users.length === 0) {
    return "## Users\n\n*No users currently in room*"
  }

  const lines = ["## Users", ""]

  for (const user of users) {
    const roles: string[] = []
    if (user.isAdmin) roles.push("Admin")
    if (user.isDj) roles.push("DJ")
    if (user.isDeputyDj) roles.push("Deputy DJ")

    const roleStr = roles.length > 0 ? ` (${roles.join(", ")})` : ""
    const statusStr = user.status === "listening" ? " 🎧" : ""

    lines.push(`- ${user.username || "Anonymous"}${roleStr}${statusStr}`)
  }

  return lines.join("\n")
}

function formatUserHistory(users: User[]): string {
  const lines = [
    "## User History",
    "",
    `*${users.length} unique user${users.length === 1 ? "" : "s"} joined this room*`,
    "",
  ]

  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    lines.push(`${i + 1}. ${user.username || "Anonymous"}`)
  }

  return lines.join("\n")
}

function formatPlaylist(
  data: RoomExportData,
  pluginRegistry: PluginRegistry | undefined,
  roomId: string,
): string {
  if (data.playlist.length === 0) {
    return "## Playlist\n\n*No tracks played yet*"
  }

  const lines = ["## Playlist", ""]

  // Table header
  lines.push("| # | Track | Artist | Album | Added By | Added At | Reactions | Links | Notes |")
  lines.push("|---|-------|--------|-------|----------|----------|-----------|-------|-------|")

  for (let i = 0; i < data.playlist.length; i++) {
    const item = data.playlist[i]
    const num = i + 1

    const track = escapeMarkdown(item.track.title)
    const artist = escapeMarkdown(item.track.artists?.map((a) => a.title).join(", ") || "Unknown")
    const album = escapeMarkdown(item.track.album?.title || "")
    const addedBy = item.addedBy?.username || "Unknown"
    const addedAt = item.addedAt ? formatTime(item.addedAt) : ""

    // Get reactions for this track
    const trackReactions = getReactionsForTrack(data.reactions, item)
    const reactionsStr = formatReactions(trackReactions)

    // Get service links
    const links = formatServiceLinks(item)

    // Get plugin notes
    const notes = pluginRegistry
      ? pluginRegistry
          .formatPluginDataAsMarkdown(roomId, item.pluginData, { type: "playlist" })
          .join(" | ")
      : ""

    lines.push(
      `| ${num} | ${track} | ${artist} | ${album} | ${addedBy} | ${addedAt} | ${reactionsStr} | ${links} | ${notes} |`,
    )
  }

  return lines.join("\n")
}

function formatChat(
  data: RoomExportData,
  pluginRegistry: PluginRegistry | undefined,
  roomId: string,
): string {
  if (data.chat.length === 0) {
    return "## Chat\n\n*No messages*"
  }

  const lines = ["## Chat", ""]

  // Sort messages by timestamp (oldest first for reading order)
  const sortedMessages = [...data.chat].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  for (const message of sortedMessages) {
    const time = formatTime(new Date(message.timestamp).getTime())
    const username = message.user?.username || "System"
    const content = message.content

    // Get reactions for this message
    const messageReactions = getReactionsForMessage(data.reactions, message.timestamp)
    const reactionsStr = messageReactions.length > 0 ? ` ${formatReactions(messageReactions)}` : ""

    // Get plugin notes
    const pluginNotes = pluginRegistry
      ? pluginRegistry.formatPluginDataAsMarkdown(roomId, (message as any).pluginData, {
          type: "chat",
        })
      : []
    const notesStr = pluginNotes.length > 0 ? ` [${pluginNotes.join(", ")}]` : ""

    // Format based on message type
    if (message.meta?.type === "alert") {
      lines.push(`> **[${time}]** 📢 ${content}${reactionsStr}${notesStr}`)
    } else {
      lines.push(`**[${time}] ${username}:** ${content}${reactionsStr}${notesStr}`)
    }
  }

  return lines.join("\n\n")
}

function formatQueue(
  data: RoomExportData,
  pluginRegistry: PluginRegistry | undefined,
  roomId: string,
): string {
  const lines = ["## Queue (Upcoming)", ""]

  lines.push("| # | Track | Artist | Added By | Notes |")
  lines.push("|---|-------|--------|----------|-------|")

  for (let i = 0; i < data.queue.length; i++) {
    const item = data.queue[i]
    const num = i + 1

    const track = escapeMarkdown(item.track.title)
    const artist = escapeMarkdown(item.track.artists?.map((a) => a.title).join(", ") || "Unknown")
    const addedBy = item.addedBy?.username || "Unknown"

    // Get plugin notes
    const notes = pluginRegistry
      ? pluginRegistry
          .formatPluginDataAsMarkdown(roomId, item.pluginData, { type: "queue" })
          .join(" | ")
      : ""

    lines.push(`| ${num} | ${track} | ${artist} | ${addedBy} | ${notes} |`)
  }

  return lines.join("\n")
}

function formatFooter(data: RoomExportData): string {
  const stats = [
    `${data.playlist.length} tracks played`,
    `${data.chat.length} messages`,
    `${data.users.length} users online`,
  ]

  if (data.userHistory && data.userHistory.length > 0) {
    stats.push(`${data.userHistory.length} unique visitors`)
  }

  if (data.queue.length > 0) {
    stats.push(`${data.queue.length} tracks queued`)
  }

  return `*${stats.join(" • ")}*`
}

// Helper functions

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

function formatReactions(reactions: Reaction[]): string {
  if (reactions.length === 0) return ""

  // Group reactions by emoji
  const grouped = reactions.reduce(
    (acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  return Object.entries(grouped)
    .map(([emoji, count]) => (count > 1 ? `${emoji}×${count}` : emoji))
    .join(" ")
}

function getReactionsForTrack(reactions: RoomExportData["reactions"], item: QueueItem): Reaction[] {
  // Try different possible IDs for the track
  const trackId = item.mediaSource?.trackId || item.track?.id
  if (!trackId) return []

  return reactions.track?.[trackId] || []
}

function getReactionsForMessage(
  reactions: RoomExportData["reactions"],
  timestamp: string,
): Reaction[] {
  return reactions.message?.[timestamp] || []
}

function formatServiceLinks(item: QueueItem): string {
  const links: string[] = []

  // Get URLs from metadataSources
  if (item.metadataSources) {
    for (const [sourceType, sourceData] of Object.entries(item.metadataSources)) {
      if (sourceData?.track?.urls) {
        const resourceUrl = sourceData.track.urls.find((u) => u.type === "resource")
        if (resourceUrl) {
          const serviceName = getServiceDisplayName(sourceType as MetadataSourceType)
          links.push(`[${serviceName}](${resourceUrl.url})`)
        }
      }
    }
  }

  // Fallback: try to get URL from primary track data
  if (links.length === 0 && item.track?.urls) {
    const resourceUrl = item.track.urls.find((u) => u.type === "resource")
    if (resourceUrl) {
      links.push(`[Link](${resourceUrl.url})`)
    }
  }

  return links.join(" \\| ") || "-"
}

function getServiceDisplayName(type: MetadataSourceType): string {
  const names: Record<MetadataSourceType, string> = {
    spotify: "Spotify",
    tidal: "Tidal",
    applemusic: "Apple Music",
  }
  return names[type] || type
}
