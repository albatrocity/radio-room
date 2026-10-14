# Game plugins

Plugins registered in `apps/api/src/server.ts`. Item and shop content for the ones that sell things lives in `@repo/plugin-item-shops` — see [Item Shops Development](SHOP_ITEM_DEVELOPMENT.md).

## Play

| Package | What it does |
| --- | --- |
| `@repo/plugin-guess-the-tune` | Hides Now Playing and scores fuzzy chat guesses |
| `@repo/plugin-quiz-sessions` | Chat-answered quiz rounds (competitive or inclusive) |
| `@repo/plugin-playlist-bingo` | Private bingo cards marked from playlist tracks |
| `@repo/plugin-lyric-hero` | Word puzzle with a crowd meter; cooperative, competitive, or inclusive |
| `@repo/plugin-queue-theme` | Per-track theme polls, coin payouts, optional decoy themes |
| `@repo/plugin-special-words` | Scores configured words in chat |

## Economy and items

| Package | What it does |
| --- | --- |
| `@repo/plugin-item-shops` | Shops, inventory items, and per-user shopping sessions |
| `@repo/plugin-the-fed` | Optional session economy controller (`costScale`) |
| `@repo/plugin-loyalty-program` | Coins for time spent in the room |

Text-size, font, and scramble effects are inventory items inside Item Shops, not a separate potion plugin.

## Queue and room tools

| Package | What it does |
| --- | --- |
| `@repo/plugin-playlist-democracy` | Skips tracks that miss a reaction threshold |
| `@repo/plugin-absent-dj` | Skips a track when the person who queued it has left |
| `@repo/plugin-queue-hygiene` | Rate limits and duplicate detection on queue adds |
| `@repo/plugin-queue-pacer` | Paces the queue toward a target end time |
| `@repo/plugin-round-robin-dj` | Turn-based deputy queueing |
| `@repo/plugin-music-upload` | Admin-designated uploaders send files to private S3 |
| `@repo/plugin-volume-manager` | Live volume control through the playback controller |
