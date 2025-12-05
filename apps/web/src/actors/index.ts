/**
 * Actor Exports
 *
 * Central export point for all actor instances and their utilities.
 */

// Socket Actor (Event Hub)
export {
  socketActor,
  subscribeActor,
  unsubscribeActor,
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
  subscribeChatActor,
  unsubscribeChatActor,
  resetChat,
  getChatMessages,
  getSortedChatMessages,
  submitMessage,
  startTyping,
  stopTyping,
} from "./chatActor"

// Playlist Actor
export {
  playlistActor,
  subscribePlaylistActor,
  unsubscribePlaylistActor,
  resetPlaylist,
  getPlaylist,
  isPlaylistActive,
  togglePlaylist,
} from "./playlistActor"

// Users Actor
export {
  usersActor,
  subscribeUsersActor,
  unsubscribeUsersActor,
  resetUsers,
  getUsers,
  getListeners,
  getDj,
  getUserById,
} from "./usersActor"

// Reactions Actor
export {
  reactionsActor,
  subscribeReactionsActor,
  unsubscribeReactionsActor,
  resetReactions,
  getAllReactions,
  getReactionsByType,
  getReactionsFor,
} from "./reactionsActor"

// Settings Actor
export {
  settingsActor,
  subscribeSettingsActor,
  unsubscribeSettingsActor,
  resetSettings,
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
  subscribeRoomActor,
  unsubscribeRoomActor,
  resetRoom,
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
  subscribeAudioActor,
  unsubscribeAudioActor,
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

// DJ Actor
export {
  djActor,
  subscribeDjActor,
  unsubscribeDjActor,
  isDjaying,
  isDeputyDjaying,
  canAddToQueue,
  startDjSession,
  endDjSession,
  startDeputyDjSession,
  endDeputyDjSession,
} from "./djActor"

// Admin Actor
export {
  adminActor,
  subscribeAdminActor,
  unsubscribeAdminActor,
  setSettings,
  clearPlaylist,
  deleteRoom,
  deputizeDj,
} from "./adminActor"

// Metadata Source Auth Actor
export {
  metadataSourceAuthActor,
  subscribeMetadataSourceAuthActor,
  unsubscribeMetadataSourceAuthActor,
  isMetadataSourceAuthenticated,
  isMetadataSourceLoading,
  fetchMetadataSourceAuthStatus,
  logoutMetadataSource,
  getServiceName,
} from "./metadataSourceAuthActor"

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

