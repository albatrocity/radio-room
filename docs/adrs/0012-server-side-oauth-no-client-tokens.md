# 0012. Server-Side OAuth with No Client-Side Token Exposure

**Date:** 2025-01-01
**Status:** Accepted

## Context

Music service integrations (Spotify, Tidal) require OAuth authentication. An earlier implementation used **client-side PKCE** (Proof Key for Code Exchange) where the browser handled the OAuth flow and held access tokens. This had several drawbacks:

- Tokens were exposed to client-side JavaScript, increasing attack surface.
- Two separate auth flows existed (server OAuth for room creation, client PKCE for metadata/library), causing maintenance burden and user confusion.
- The client needed service-specific logic for token refresh.

## Decision

Use **server-side OAuth exclusively**. Tokens are never exposed to the browser.

- OAuth flows redirect through the server: `/auth/{service}/login` initiates the flow, `/auth/{service}/callback` receives the authorization code and exchanges it for tokens server-side.
- Tokens are stored in Redis (`user:{userId}:service:{serviceName}:auth`) and refreshed server-side ~5 minutes before expiry via a generic `refreshServiceTokens` job.
- The **room creator's tokens** are used for playback control and library/search operations. Guests do not receive access tokens.
- The web client sends only track IDs for library operations (e.g., "add to library"); the **server infers** which metadata source to use based on the room's configuration.
- A service-agnostic `metadataSourceAuthMachine` on the frontend handles the auth redirect flow without service-specific code.

## Consequences

- **Security**: Tokens are never in the browser; server-side storage and refresh reduce exposure.
- **Simplicity**: One auth flow instead of two; the client doesn't manage tokens or refreshes.
- **Service-agnostic frontend**: The web client uses generic auth routes (`/auth/{service}/...`) and doesn't need service-specific OAuth logic.
- **Trade-off**: Only the room creator (admin) can perform authenticated operations (library management, search). Guests rely on the creator's session.
- **Trade-off**: Server must handle token refresh lifecycle, adding operational complexity.

See also: [work-history/PKCE_CLEANUP_SUMMARY.md](../../work-history/PKCE_CLEANUP_SUMMARY.md)
