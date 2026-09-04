/** Marks Game State collection rows and open item-detail wrappers. */
export const INVENTORY_ITEM_DOM_ATTR = "data-inventory-item-id"

export function queryInventoryItemElements(itemId: string): HTMLElement[] {
  const trimmed = itemId.trim()
  if (!trimmed) return []
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(trimmed) : trimmed
  const nodes = document.querySelectorAll(`[${INVENTORY_ITEM_DOM_ATTR}="${escaped}"]`)
  return [...nodes].filter((node): node is HTMLElement => node instanceof HTMLElement)
}

/**
 * Poll until at least one matching node exists or `waitForDomMs` elapses.
 * Used when React has not yet committed a newly acquired collection row.
 */
export async function waitForInventoryItemElements(
  itemId: string,
  waitForDomMs: number,
): Promise<HTMLElement[]> {
  const deadline = Date.now() + Math.max(0, waitForDomMs)
  for (;;) {
    const elements = queryInventoryItemElements(itemId)
    if (elements.length > 0) return elements
    if (Date.now() >= deadline) return []
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
}
