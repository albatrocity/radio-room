# 0203. Presentation themes for system messages and plugin-authored polls

**Date:** 2026-10-02
**Status:** Accepted

## Context

Most listeners follow a road trip ([0200](0200-road-trips-v1.md)) through chat. Plain system alerts look like any other notice, so trip moments blend in. Skip polls look like the host's polls, so listeners can't tell a trip exit from a host question. We wanted trip messages and polls to look like highway signs without forking `SystemMessage` or `PollCard`, and without letting any client choose a look.

## Decision

1. **One shared theme enum.** `presentationThemeSchema` (`"road-trip"`) and `presentationVariantSchema` (`info | success | warning | error`) live in `@repo/types` (`PresentationTheme.ts`).
2. **Themed system messages.** `ChatMessage.meta` gains `theme?` and `icon?`. A plugin sets them through `sendSystemMessage` / `sendUserSystemMessage` meta. The existing `status` is the variant, and `title` is the headline.
3. **Plugin-only poll presentation (extends [0152](0152-plugin-authored-core-polls.md)).** `Poll.presentation?: { theme, variant?, eyebrow?, headline?, icon?, imageUrl?, footnote? }`. `eyebrow` is the small label above the headline ("EXIT 41"), so renderers never parse it out of the headline.
   - `createPoll` keeps it only for plugin-sourced polls and validates it with the schema. The admin poll handler doesn't accept it, so a themed poll always comes from a plugin.
   - Redis stores it as JSON. A malformed value drops the theme but keeps the poll, so poll history still shows closed trip polls as trip polls.
   - `resultsInChat?: boolean` is the one display-behavior flag. It means the plugin posts the outcome to chat itself, so the web poll machine drops the poll on close instead of running the results reveal. Road-trip skip polls set it.
4. **One web registry.** `apps/web/src/components/PresentationThemes/registry.ts` exposes `getChatTheme(theme)` and `getPollTheme(theme)`.
   - `SystemMessage` renders the themed message component when there is one.
   - `PollCard` keeps its voting, results, and countdown logic. A poll theme only supplies the look: `Header`, `collapsedLabel`, `optionLabel`, `CloseBar`, and an optional `Footer`.
   - An unknown or missing theme renders the plain look, so new themes are backward compatible.
   - A card the viewer dismissed stays dismissed when its poll closes (for every poll, themed or not); the closed poll is cleared without a reveal.
5. **The road-trip theme.**
   - Signs are compact, with one headline and one body line, so they read as part of chat. The variants are an `info` green guide sign, a `success` blue service sign, a `warning` yellow sign, and an `error` orange work-zone sign.
   - Skip polls render as exit signs. The options get lane arrows by position (first option = exit), not by matching option text. A GPS-style "Exit in m:ss" bar runs on the shared ticker, and the footnote states the default.
   - When animations are off, the bar doesn't animate.

## Consequences

- Plugins can give their messages and polls a distinct look with data alone, and core stays theme-agnostic apart from the enum.
- Adding a theme means adding an enum value and registering renderers. Old clients fall back to plain.
- The poll history modal still renders themed polls plainly. Theming it is a small follow-up through the same registry.
