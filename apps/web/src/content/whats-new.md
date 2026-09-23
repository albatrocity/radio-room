<!--
Listener-facing. Newest month first.
Add bullets in the same PR as the user-visible change, under the upcoming show’s heading.
Headings: ## Month YYYY
Sections: ### New   ### Fixed
-->

## October 2026

Recap of what’s landed since the September show.

- Fixed an issue where previewing tracks from the Record Store would cause the entire app to crash.
- Fixes race condition where multiple correct guesses in Lyric Hero within a short time period would cause a miss. Also makes it more forgiving with punctuation.
- New items

## September 2026

Recap of what’s landed since the August 20 show.

### New

- Tour Laminate: a punch-card of sorts: records every show it's in someone's inventory. Keep it safe across shows for prestige.
- Gift items to other listeners, or open a two-party trade.
- Sweetwater toys: Oscilloscope, Beat Detector, VU Meter, and Chromatic Tuner.
- Spy World shop: devious but useful items.
- "Queue Theme" game mode: vote on whether queued tracks match a theme
- Lyric Hero: complete a phrase by guessing words, hangman style.
- Upgrades Van Cubby and Merch Cash Box to be reusable: empty them and reclaim them to use again. 3 and 5 item variants are also available.
- Add public names and notes to storage containers.
- Music now ducks under sound effects, and there's a setting to disable them completely.
- Feedback: tell us whether you like or dislike a particular feature, plus an open feedback form.
- Inline markdown support in chat.
- iOS Home Screen support via "Add to Home Screen" in the share sheet. Runs without browser's address bar Chrome.
- On a wide screen, Game State docks beside the room instead of opening in a modal. Phone layout is less cramped.
- Now Playing artwork is larger.
- When the queue count or list is hidden for the purposes of a game, the UI now obscures it instead of just hiding it, which made it look broken sometimes.

### Fixed

- Spotify is much less likely to skip a playing track on a blip, stall at the end of a song, or fail to advance the queue.
- Game sessions keep running when the show rolls into the next segment.
- Add to Queue is snappier; search rows no longer overflow.

## August 2026

Recap of what’s landed since the July 16 show.

### New

- Playlist Bingo: each listener gets a private card; mark squares as the night’s playlist hits your criteria.
- Round Robin DJ: when you’re deputized, turns rotate fairly so everyone gets a shot to queue.
- Quiz sessions got a polish pass (clearer flow and authoring for hosts).

### Fixed

- Queue Pacer is less likely to skip twice in a row.
- Spotify auth is more resilient when Spotify returns temporary errors.
- General performance pass so the room UI feels snappier under load.
