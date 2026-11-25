# 0230. Game Studio Navidrome snapshot (live or `navidrome.db`)

**Date:** 2026-11-23
**Status:** Accepted

## Context

Game Studio's record picker and trip-sim library bins talk to the designer's Navidrome through studio-bridge Subsonic routes ([0224](0224-record-picks.md) decision 10). Designers without a connection to the DJ Mac still need to search albums and save local picks into trip shops. Navidrome stores the same album ids the Subsonic API returns in `album.id` inside `navidrome.db`, so a copied database is a usable offline catalog for authoring.

## Decision

1. **Two local library sources for Game Studio only.** studio-bridge serves local album search, pick lookup, and `listLibraryAlbums` from either:
   - **Live:** Subsonic, as today (`NAVIDROME_*` env or Media Bridge daemon config).
   - **File:** a read-only filesystem pointer to a `navidrome.db` (or a copy of it).
2. **Pick ids stay `album.id`.** File mode reads the Navidrome primary key. It does not recompute PIDs, MusicBrainz ids, or path hashes. A pick authored from a snapshot of the room's library keeps the same `id` the live API would return for that album.
3. **The pointer is bridge config, not map JSON.** Active mode and last path live in `~/.config/listening-room-bridge/studio-library.json` and in bridge memory. Trip maps still snapshot `PhysicalMediaPick` fields only.
4. **One mapper for both backends.** Search hits, picks, and `LibraryAlbumRow`s are built from the same field rules (`id`, `name`/`title`, `album_artist`/`artist`, year from `max_original_year` then `max_year`, `song_count`, genres from `genre` + `tags.genre`, skip `missing`). File-mode `userRating` is the max `annotation.rating` for `item_type = 'album'`.
5. **Covers stay live-only.** File mode returns 404 for `/records/local/:id/cover`. The picker already tolerates a missing cover; rooms still fill sleeves from their own library.
6. **Queries stay off secrets.** File mode opens SQLite read-only and reads `album` and `annotation` only (never `property` or `user`).
7. **Switching is a header control.** Game Studio's Studio header toggles Live vs Database and can choose or paste a path. Switching does not rewrite open maps; the next search and library fetch use the new source.
8. **Room runtime is unchanged.** `resolvePick` still matches a local pick against the room's live library by id, then artist + title.

## Consequences

- Designers can author local picks offline from a DJ Mac database copy. A different Navidrome instance's db will not match existing map picks.
- File search uses SQL `LIKE`, so hit order can differ from live Subsonic; ids for matching albums do not.
- Multi-user ratings use max in file mode, so trip-sim rarity can differ from one user's stars. Picks do not store rating.
- A copy taken mid-write can miss WAL pages; the bridge surfaces the SQLite error and the designer copies after a checkpoint or with `-wal`/`-shm`.

## See also

- [0224. Record picks](0224-record-picks.md) (decision 10 partially superseded)
- [0221. Game Studio trip simulator](0221-game-studio-trip-simulator.md)
- [0222. Physical media carry](0222-physical-media-carry.md)
