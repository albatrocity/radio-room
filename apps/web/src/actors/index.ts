/**
 * Actor Exports
 *
 * Central export point for all actor instances and their utilities.
 * Note: Subscribe/unsubscribe functions have been removed - actors now manage
 * their own socket subscriptions internally via ACTIVATE/DEACTIVATE events.
 */

// Socket Actor (Event Hub)
export {
  socketActor,
  subscribeActor,
  unsubscribeActor,
  subscribeById,
  unsubscribeById,
  emitToSocket,
  getConnectionStatus,
  isConnected,
} from "./socketActor"

// Auth Actor
export {
  authActor,
  getCurrentUser,
  getIsAdmin,
  getIsAuthenticated,
  getAuthContext,
  sendAuthEvent,
} from "./authActor"

// Modals Actor
export {
  modalsActor,
  isModalOpen,
  isAnyModalOpen,
  getCurrentModal,
  sendModalsEvent,
  closeModal,
} from "./modalsActor"

// Theme Actor
export { themeActor, getCurrentTheme, setTheme } from "./themeActor"

// Errors Actor
export { errorsActor, reportError, clearError, getErrors } from "./errorsActor"

// Chat Actor
export {
  chatActor,
  getChatMessages,
  getSortedChatMessages,
  submitMessage,
  startTyping,
  stopTyping,
} from "./chatActor"

// Playlist Actor
export { playlistActor, getPlaylist, isPlaylistExpanded, togglePlaylist } from "./playlistActor"

// Queue List Actor
export { queueListActor, getQueueList, getQueueCount, hasQueueItems } from "./queueListActor"

// Users Actor
export { usersActor, getUsers, getListeners, getDj, getUserById } from "./usersActor"

// Reactions Actor
export {
  reactionsActor,
  getAllReactions,
  getReactionsByType,
  getReactionsFor,
} from "./reactionsActor"

// Settings Actor
export {
  settingsActor,
  getSettings,
  getRoomTitle,
  getRoomType,
  isDeputizeOnJoin,
  getPluginConfigs,
  fetchSettings,
} from "./settingsActor"

// Room Actor
export {
  roomActor,
  getCurrentRoom,
  getRoomError,
  roomHasAudio,
  getRoomBanner,
  getRoomCreator,
  fetchRoom,
  getLatestRoomData,
} from "./roomActor"

// Audio Actor
export {
  audioActor,
  getVolume,
  getAudioMeta,
  getMediaSourceStatus,
  isPlaying,
  isMuted,
  isOnline,
  toggleAudio,
  changeVolume,
  toggleMute,
} from "./audioActor"

// Sound Effects Actor
export {
  soundEffectsActor,
  isPlayingSoundEffect,
  getQueuedSoundEffectsCount,
} from "./soundEffectsActor"

// DJ Actor
export {
  djActor,
  isDjaying,
  isDeputyDjaying,
  canAddToQueue,
  startDjSession,
  endDjSession,
  startDeputyDjSession,
  endDeputyDjSession,
} from "./djActor"

// Admin Actor
export { adminActor, setSettings, clearPlaylist, deleteRoom, deputizeDj } from "./adminActor"

// Metadata Source Auth Actor
export {
  metadataSourceAuthActor,
  isMetadataSourceAuthenticated,
  isMetadataSourceLoading,
  fetchMetadataSourceAuthStatus,
  logoutMetadataSource,
  getServiceName,
} from "./metadataSourceAuthActor"

// Metadata Preference Actor
export {
  metadataPreferenceActor,
  getPreferredSource,
  getAvailableSources,
  setAvailableSources,
  setPreferredSource,
  clearPreference,
  metadataSourceDisplayNames,
} from "./metadataPreferenceActor"

// Bookmarked Chat Actor
export {
  bookmarkedChatActor,
  getBookmarks,
  toggleBookmark,
  isBookmarked,
  clearBookmarks,
  setBookmarks,
} from "./bookmarkedChatActor"

// Room Lifecycle
export {
  initializeRoom,
  teardownRoom,
  changeRoom,
  getCurrentRoomId,
  isRoomInitialized,
  forceCleanup,
  handleVisibilityChange,
} from "./roomLifecycle"
