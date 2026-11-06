# 0229. Site system messages

**Date:** 2026-11-02
**Status:** Accepted

## Context

A site's arrival and departure narrative ([0212](0212-site-narrative-chat.md), [0226](0226-site-departure-narrative.md)) posts as `meta.type: "prose"`: a centered paragraph. That reads the same as any other prose line, and the site's icon never appears beside the story. Info alerts are already a left-aligned row with an icon on the left. Site narrative should use that row, with the site's own icon in place of the status "i".

## Decision

1. **`chatMessageMetaSchema.type` gains `"site"`.** `SystemMessage` renders it before theme lookup, so it is not a road sign.
2. **The author picks it on the site.** `narrativeVariant` and `departNarrativeVariant` gain `"site"`, beside `info`, `success`, `warning`, and `error`. The Trip map editor's System message select on On visit and On departure lists it. Omitted stays plain prose. An alert status stays that alert. Event narrative does not offer `site`.
3. **The layout matches an info alert.** The row is left-aligned, full width, with the icon on the left and a wrapping body. It uses the `info` status color. The status indicator is not drawn.
4. **The icon is the site's.** `meta.icon` is the site glyph (an emoji, or a Lucide name resolved with `getIcon`, as in [0218](0218-system-message-actions-and-theme-icons.md)). `narrate` and `departNarrate` set `icon` only when the variant is `site`. `narrateMessageMeta` turns that into `{ type: "site", icon }`.

## Consequences

- A stop's story can use the same row as an info notice, marked with that site's icon, when the author chooses Site.
- Plain and the alert statuses are unchanged.
- Clients that do not know `type: "site"` show the paragraph as an ordinary system message. The text still arrives; the icon is ignored.

## See also

- [0212. Site narrative is chat prose, not a road sign](0212-site-narrative-chat.md)
- [0226. Site departure narrative](0226-site-departure-narrative.md)
- [0208. Presentation themes](0208-presentation-themes.md)
