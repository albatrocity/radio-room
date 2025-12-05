# Graceful Reconnection Implementation

## Summary
Implemented comprehensive reconnection handling to prevent stale data and connection issues when users unfocus the browser, lock their mobile screen, or experience network interruptions.

## Problem Statement
Users experienced:
- Stale data after returning to the app
- Inability to send messages after tab/screen unfocus
- No feedback during connection issues
- Failed reconnections after network interruptions

## Solution

### 1. Enhanced Socket.IO Configuration (`apps/web/src/lib/socket.ts`)

**Added:**
- `reconnectionAttempts: 10` - Up to 10 reconnection attempts
- `reconnectionDelay: 1000` - 1 second between attempts
- `timeout: 20000` - 20 second timeout for connections
- Comprehensive connection logging for all lifecycle events:
  - `connect` - Socket connected
  - `disconnect` - Socket disconnected
  - `reconnect_attempt` - Reconnection attempt in progress
  - `reconnect` - Successfully reconnected
  - `reconnect_error` - Reconnection error
  - `reconnect_failed` - All reconnection attempts failed

### 2. Improved Socket Service (`apps/web/src/lib/socketService.ts`)

**Added comprehensive lifecycle event handling:**
- `SOCKET_CONNECTED` - Emitted when socket connects
- `SOCKET_DISCONNECTED` - Emitted when socket disconnects (includes reason)
- `SOCKET_RECONNECTING` - Emitted during reconnection attempts (includes attempt number)
- `SOCKET_RECONNECTED` - Emitted after successful reconnection
- `SOCKET_RECONNECT_FAILED` - Emitted if all reconnection attempts fail
- `SOCKET_ERROR` - Emitted on socket errors

**Improved message sending:**
- Only attempts to emit events when socket is connected
- Logs warnings when trying to send while disconnected
- Automatically triggers reconnection if socket becomes inactive

### 3. Visibility Change Detection (`apps/web/src/machines/authMachine.ts`)

**Added visibility change monitoring:**
- Detects when user switches tabs or locks screen
- Checks socket connection status when returning to tab
- Triggers reconnection flow if socket disconnected during absence
- Cleans up event listeners properly

### 4. Enhanced Auth Machine State Management

**Updated `authenticated` state:**
- Added `SOCKET_DISCONNECTED` event handler → transitions to `disconnected` state
- Logs disconnect events for debugging

**Enhanced `disconnected` state:**
- **Entry action:** Shows "Connection lost" toast
- **Event handlers:**
  - `SOCKET_RECONNECTED` → Returns to `retrieving` state and shows "Reconnected!" toast
  - `SOCKET_RECONNECTING` → Shows reconnection attempt progress
  - `SOCKET_RECONNECT_FAILED` → Shows error toast with instruction to refresh

**Toast notifications:**
- `showDisconnectedToast` - Warning toast with "Attempting to reconnect..."
- `showReconnectingToast` - Info toast showing attempt number
- `showReconnectedToast` - Success toast confirming restoration
- `showReconnectFailedToast` - Error toast prompting page refresh

All toasts use `id: "connection-status"` to replace previous toasts instead of stacking.

### 5. Room Data Refetching (`apps/web/src/machines/roomFetchMachine.ts`)

**Updated socket event monitoring:**
- Detects reconnection events
- Logs reconnection for debugging
- Triggers `getLatestData` action on reconnection
- Refetches:
  - Room metadata
  - User list
  - Chat messages
  - Current track
  - Queue/Playlist

## Connection Flow

### Normal Connection
1. User opens app → Socket connects
2. `SOCKET_CONNECTED` event emitted
3. Auth machine authenticates user
4. User joins room

### Disconnection & Reconnection
1. User loses connection (tab unfocus, network drop, server restart)
2. `SOCKET_DISCONNECTED` event emitted
3. Auth machine transitions to `disconnected` state
4. Toast shows: "Connection lost, attempting to reconnect..."
5. Socket.IO automatically attempts reconnection (up to 10 times)
6. Each attempt triggers `SOCKET_RECONNECTING` event
7. Toast updates: "Reconnecting... Attempt X"
8. **On successful reconnection:**
   - `SOCKET_RECONNECTED` event emitted
   - Auth machine transitions to `retrieving` state
   - Password and user data loaded from storage
   - Login attempt with stored credentials
   - Room data refetched
   - Toast shows: "Reconnected! Connection restored"
9. **On reconnection failure:**
   - `SOCKET_RECONNECT_FAILED` event emitted
   - Toast shows: "Connection failed. Please refresh the page."

### Visibility Changes
1. User switches away from tab or locks screen
2. Visibility change listener detects return
3. Checks if socket is still connected
4. If disconnected, triggers reconnection flow
5. Ensures fresh data when user returns

## Benefits

✅ **Resilient Connections** - Automatically reconnects on network issues
✅ **No Stale Data** - Refetches all room state on reconnection
✅ **User Feedback** - Clear toast notifications about connection status
✅ **Tab Switching** - Handles browser tab unfocus gracefully
✅ **Mobile Support** - Works with screen lock/unlock on mobile
✅ **Message Reliability** - Only sends messages when connected
✅ **Debugging** - Comprehensive logging for troubleshooting

## Testing Scenarios

1. **Tab Switch Test:**
   - Open app → Switch to another tab for 30 seconds → Return
   - ✅ Should reconnect and refetch data

2. **Network Interruption Test:**
   - Open app → Disconnect WiFi → Wait 5 seconds → Reconnect WiFi
   - ✅ Should show reconnecting toast and restore connection

3. **Mobile Lock Test:**
   - Open app on mobile → Lock screen → Wait 1 minute → Unlock
   - ✅ Should reconnect and refetch data

4. **Server Restart Test:**
   - Open app → Restart API server → Wait for server to start
   - ✅ Should reconnect automatically

5. **Message Sending Test:**
   - Open app → Disconnect → Try to send message → Reconnect
   - ✅ Should show warning, prevent sending while disconnected, work after reconnection

## Future Enhancements

Potential improvements for future consideration:
- Offline queue for messages sent while disconnected
- Connection quality indicator in UI
- Manual reconnect button
- Configurable reconnection strategy per environment
- Service worker for background reconnection

