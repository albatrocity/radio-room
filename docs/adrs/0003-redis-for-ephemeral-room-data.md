# 0003. Redis for Ephemeral Room Data

**Date:** 2025-01-01
**Status:** Accepted

## Context

Rooms in the Listening Room are inherently ephemeral: they are created, used for a listening session, and eventually torn down. The data associated with a room (queue, users, playback state, plugin storage, chat) does not need to be persisted long-term. The system also requires real-time communication across potentially multiple server instances (horizontal scaling), pub/sub for event distribution, and session storage.

## Decision

Use **Redis** as the primary data store for all room-related state, leveraging its pub/sub capabilities and natural fit for ephemeral data.

Redis serves multiple roles:

- **Room state**: Keys like `room:{roomId}:*` store room metadata, queue, admins, DJs, and related data.
- **Pub/sub for SystemEvents**: Events are published to `SYSTEM:{EVENT_NAME}` channels for cross-instance distribution.
- **Socket.IO adapter**: `@socket.io/redis-adapter` enables horizontal scaling across multiple server instances using a `pubClient`/`subClient` pair.
- **Session storage**: `connect-redis` stores Express sessions with prefix `s:`.
- **Plugin storage**: Namespaced per plugin and room (`room:{roomId}:plugins:{pluginName}:storage:{key}`).
- **Adapter credentials**: User OAuth tokens stored at `user:{userId}:service:{serviceName}:auth`.

Room creators can choose to **export an artifact** of the room experience (playlist, chat log, etc.), which is sufficient for archival purposes.

## Consequences

- **Natural expiration**: Room data can be cleaned up simply by deleting keys, with no schema migrations or relational integrity concerns.
- **Real-time pub/sub**: Event fan-out across instances is built into the same infrastructure used for data storage.
- **Low-latency reads/writes**: Redis's in-memory nature matches the real-time requirements of a collaborative listening session.
- **Trade-off**: If Redis is restarted, active room data is lost. This is acceptable because rooms are ephemeral by design.
- **Trade-off**: Complex querying (e.g., "find all rooms by genre") requires maintaining index structures manually rather than using SQL-style queries.
- **Pipeline optimization**: Plugin storage uses Redis pipelines for batch operations (e.g., ~70-80% latency reduction in playlist-democracy hydration).
