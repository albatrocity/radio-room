# XState v5 Migration: Verification Checklist

## Overview
This document provides a comprehensive checklist for verifying the XState v5 migration is complete and functional.

## Date
November 23, 2025

## Pre-Launch Verification

### 1. Build & Type Check
- [ ] Run `pnpm build` - ensure no TypeScript errors
- [ ] Run `pnpm typecheck` - verify all type definitions
- [ ] Check for any console warnings during build

### 2. Machine Verification

#### Core Machines (Critical Path)
- [ ] **authMachine** - User authentication flow
  - [ ] Login/logout functionality
  - [ ] Session persistence
  - [ ] Password protection
  - [ ] Socket reconnection handling
- [ ] **roomFetchMachine** - Room data fetching
  - [ ] Initial room load
  - [ ] Reconnection data refresh
  - [ ] Error handling
- [ ] **queueMachine** - Track queueing
  - [ ] Adding tracks to queue
  - [ ] Loading states
  - [ ] Success/failure toasts

#### UI Machines
- [ ] **modalsMachine** - Modal dialog management
  - [ ] Opening/closing modals
  - [ ] Settings modal navigation
- [ ] **chatMachine** - Chat functionality
  - [ ] Sending messages
  - [ ] Typing indicators
  - [ ] Message persistence
- [ ] **audioMachine** - Audio playback
  - [ ] Play/pause controls
  - [ ] Volume control
  - [ ] Online/offline states

#### Data Machines
- [ ] **playlistMachine** - Playlist management
  - [ ] Track history display
  - [ ] Playlist filtering
- [ ] **usersMachine** - User list
  - [ ] User join/leave events
  - [ ] DJ/listener separation
- [ ] **reactionsMachine** - Reactions
  - [ ] Adding reactions
  - [ ] Removing reactions
  - [ ] Reaction counts

#### Spotify Integration
- [ ] **spotifyAuthMachine** - Server-side Spotify auth status
  - [ ] Authentication status check
  - [ ] Logout functionality
- [ ] **addToLibraryMachine** - Library management (service-agnostic)
  - [ ] Check saved tracks
  - [ ] Add to library
  - [ ] Remove from library
- [ ] **savedTracksMachine** - Saved tracks fetching
  - [ ] Load saved tracks
  - [ ] Display in queue modal
- [ ] **trackSearchMachine** - Track search
  - [ ] Search functionality
  - [ ] Result display
- [ ] **savePlaylistMachine** - Playlist creation
  - [ ] Create playlist on Spotify
  - [ ] Success/failure handling

#### Admin & Settings
- [ ] **adminMachine** - Admin actions
  - [ ] Settings updates
  - [ ] Room deletion
  - [ ] Playlist clearing
  - [ ] DJ deputization
- [ ] **settingsMachine** - Room settings
  - [ ] Fetch room settings
  - [ ] Submit changes
- [ ] **triggerEventsMachine** - Trigger events
  - [ ] Reaction triggers
  - [ ] Message triggers

#### Supporting Machines
- [ ] **themeMachine** - Theme persistence
- [ ] **typingMachine** - Typing indicators
- [ ] **scrollFollowMachine** - Scroll behavior
- [ ] **debouncedInputMachine** / **debounceInputMachine** - Debounced input
- [ ] **toggleableCollectionMachine** - Generic collections (bookmarks, filters, selections)
- [ ] **allReactionsMachine** - All reactions tracking
- [ ] **errorHandlerMachine** - Error toast display
- [ ] **djMachine** - DJ status
- [ ] **createdRoomsFetchMachine** - User's created rooms
- [ ] **roomSetupMachine** - Room creation flow
- [ ] **TimerMachine** - Countdown timer

### 3. Component Integration Testing

#### Authentication & Navigation
- [ ] Login flow (`/login` page)
- [ ] OAuth callback (`/callback` page)
- [ ] Session persistence across refreshes
- [ ] Logout functionality
- [ ] Password-protected rooms

#### Room Management
- [ ] Create jukebox room
- [ ] Create radio room
- [ ] Join existing room
- [ ] Room deletion (admin)
- [ ] Room settings updates (admin)

#### Music Features
- [ ] Search for tracks
- [ ] Add track to queue (DJ/deputy DJ)
- [ ] View queue
- [ ] View playlist/history
- [ ] Save playlist to Spotify (admin)
- [ ] Add track to library (admin)
- [ ] View saved tracks (admin)

#### Chat & Social
- [ ] Send chat message
- [ ] View typing indicators
- [ ] Add reactions to messages
- [ ] Add reactions to tracks
- [ ] Scroll-to-bottom functionality
- [ ] New message notifications

#### Admin Features
- [ ] Change room settings
- [ ] Deputize users as DJs
- [ ] Kick users
- [ ] Delete room
- [ ] Clear playlist
- [ ] Configure reaction triggers
- [ ] Configure message triggers

### 4. Edge Cases & Error Handling

- [ ] Socket disconnection and reconnection
- [ ] Tab unfocus and refocus (visibility API)
- [ ] Expired/invalid Spotify tokens
- [ ] Network errors during API calls
- [ ] Attempting restricted actions without permissions
- [ ] Accessing deleted rooms
- [ ] Password entry (correct/incorrect)
- [ ] Concurrent user actions

### 5. Browser Compatibility

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

## Migration Completeness Checklist

### Files Migrated
- [x] All 28 state machines migrated to v5
- [x] All React components using `useMachine` updated
- [x] All Zustand stores using XState machines verified
- [x] Package.json dependencies updated
- [x] TypeScript types updated

### Removed/Cleaned Up
- [x] Client-side PKCE authentication (spotifyUserAuthMachine)
- [x] Spotify-specific machines replaced with generic versions
- [x] Unused authentication stores (spotifyAuthStore)
- [x] PKCE helper functions (spotifyPKCE.ts)

### Documentation
- [x] Migration patterns documented
- [x] Status tracking created
- [x] Progress log maintained
- [x] Verification checklist created
- [x] React hooks update summary

## Known Issues / Notes

1. **Zustand Middleware**: The `zustand-middleware-xstate` package may need updates for full v5 support
2. **State vs Snapshot**: Zustand stores still use `.state` property (different from `useMachine` snapshots)
3. **Backward Compatibility**: `useAddToQueue` maintains backward compatibility by returning `{ state: snapshot, ... }`

## Testing Commands

```bash
# Type check
pnpm typecheck

# Build
pnpm build

# Dev mode (test locally)
pnpm dev

# Lint
pnpm lint
```

## Rollback Plan

If critical issues are found:

1. Revert to previous commit before XState v5 migration
2. Document specific issues encountered
3. Create targeted fix plan
4. Re-attempt migration with fixes

## Sign-Off

Once all checklist items are verified:

- [ ] Developer testing complete
- [ ] Code review complete
- [ ] Documentation updated
- [ ] Ready for deployment

---

**Migration Completed By**: AI Assistant  
**Verification Date**: _To be filled in after manual testing_  
**Approved By**: _To be filled in by user_

