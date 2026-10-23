# 0218. System message actions and Lucide icons in presentation themes

**Date:** 2026-10-21
**Status:** Accepted

## Context

When a room shop opens (for example at a road-trip stop), Item Shops posts an alert to chat. To shop, listeners then have to find the game modal and its shop tab on their own. Presentation themes ([0208](0208-presentation-themes.md)) can only show emoji: road signs take `meta.icon` as an emoji, and exit polls draw their lane arrows as text glyphs.

## Decision

1. **A system message can carry one action.** `chatMessageMetaSchema` gains `action: { label, target }` (`ChatMessageAction` in `@repo/types`). For now, `target` can only be `{ surface: "gameState", tabId }`, where `tabId` is the game modal key `${pluginName}:${schemaTabId}`. `SystemMessage` draws it as a small outline button. In an alert the button goes at the end of the row; in prose, plain and themed messages it goes underneath. Clicking it calls `navigateToTarget`, the same navigation notifications use, so messages and notifications open surfaces the same way.
2. **Shop openings use it.** Item Shops' `openRoomShop` attaches "Open shop" with the target `item-shops:item-shops-tab`.
3. **`meta.icon` takes a Lucide name too.** A themed message resolves `meta.icon` with `getIcon`. If that finds a Lucide icon, it draws the icon; otherwise it draws the string as an emoji. Road Trip's "Back on the road" sign uses `"Van"`.
4. **Poll themes can give options icons.** `PollTheme.optionIcon(poll, option)` returns a component. `PollOptionButton` and `PollResultsBar` draw it before the label. The road-trip exit poll uses `CornerUpRight` for the exit (the first option) and `MoveUp` for staying on the highway. They are still chosen by position, as 0208 describes.

## Consequences

- Any plugin can send listeners from a chat message to a game tab without host changes. Another kind of target means widening the `target` union and `navigateToTarget`.
- `systemMessage()` doesn't validate meta, and `navigateToTarget` doesn't check that the tab exists. A wrong `tabId` is a sender bug, and only shows up when someone clicks the button.
- If an emoji happens to match a Lucide export name it would render as an icon. Emoji are never valid identifiers, so this can't happen.
