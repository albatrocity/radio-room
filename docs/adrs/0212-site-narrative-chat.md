# 0212. Site narrative is chat prose, not a road sign

**Date:** 2026-10-18
**Status:** Accepted

## Context

A stop already posts a road sign: where the van parked, for how long, and whether a shop or pump is open ([0205](0205-road-trips-v1.md), [0208](0208-presentation-themes.md)). That sign is one headline and one clamped line. A site also needs room for a paragraph of story, including sites with no shop.

`shop.openingMessage` is the wrong place for that. It is shop copy, posted by Item Shops when a round opens, and a site with no shop never sends it. Putting the paragraph on the exit sign would truncate it and mix "where we stopped" with the story.

## Decision

1. **`site.narrative`** is an optional string on a Trip Map site, at most 2000 characters. It is independent of `description`, `lore`, and `shop.openingMessage`.
2. **It posts only when the van stops there** (park, destination arrival, or a tow into a Mechanic). Driving past does not post it. Blank or whitespace-only copy posts nothing.
3. **It is not a road sign.** Road-trip emits a `narrate` effect, and `runEffects` sends it with `sendSystemMessage` and `meta.type: "prose"`. Prose is a wrapping paragraph in chat. It does not go through `tripAnnounce` and does not use the `road-trip` theme. Status messages still do.
4. **`shop.openingMessage` stays shop copy.** Item Shops still posts it when that shop opens. It is not a fallback for `narrative`.
5. **`narrativeVariant`** is optional: `info`, `success`, `warning`, or `error`. When set, the prose message uses that system-alert status. When omitted, the paragraph posts on its own.

## Consequences

- Authors can narrate a stop that sells nothing. The exit sign stays a location marker.
- Trip chat now has two voices: signs for status, prose for story. [0205](0205-road-trips-v1.md) decision 9's "every trip message is a road sign" does not cover `narrative`.
- Old clients that do not know `type: "prose"` show the paragraph as an ordinary system message. The text still arrives.
- Lore stays on the site detail page. Narrative is the chat line.

## See also

- [0205. Road trips v1](0205-road-trips-v1.md)
- [0207. Trip Maps as portable JSON](0207-trip-maps-portable-json.md)
- [0208. Presentation themes](0208-presentation-themes.md)
