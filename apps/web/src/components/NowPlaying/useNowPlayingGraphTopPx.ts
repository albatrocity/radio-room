import { useEffect, useState, type RefObject } from "react"

/** Chakra default `sm` — column layout puts artwork above metadata. */
const DESKTOP_LAYOUT_MQ = "(min-width: 30em)"
const ARTWORK_ANCHOR = "[data-now-playing-artwork]"

/**
 * CSS pixels from the top of the Now Playing host to the bottom of artwork
 * on desktop, so radio visuals sit in the empty region rather than under the cover.
 */
export function useNowPlayingGraphTopPx(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
): number {
  const [topPx, setTopPx] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const host = containerRef.current?.parentElement
    if (!host) return

    const mq = window.matchMedia(DESKTOP_LAYOUT_MQ)
    let artRo: ResizeObserver | null = null
    let observedArt: Element | null = null

    const updateTop = () => {
      if (!mq.matches) {
        setTopPx(0)
        return
      }
      const art = host.querySelector(ARTWORK_ANCHOR)
      if (!(art instanceof HTMLElement)) {
        setTopPx(0)
        return
      }
      const hostRect = host.getBoundingClientRect()
      const artRect = art.getBoundingClientRect()
      setTopPx(Math.max(0, Math.round(artRect.bottom - hostRect.top)))
    }

    const bindArtObserver = () => {
      const art = host.querySelector(ARTWORK_ANCHOR)
      if (art === observedArt) return
      artRo?.disconnect()
      observedArt = art
      if (art) {
        artRo = new ResizeObserver(updateTop)
        artRo.observe(art)
      }
    }

    const onDomChange = () => {
      bindArtObserver()
      updateTop()
    }

    const hostRo = new ResizeObserver(onDomChange)
    hostRo.observe(host)
    const mo = new MutationObserver(onDomChange)
    mo.observe(host, { childList: true, subtree: true })
    host.addEventListener("scroll", updateTop, true)
    mq.addEventListener("change", updateTop)
    onDomChange()

    return () => {
      hostRo.disconnect()
      artRo?.disconnect()
      mo.disconnect()
      host.removeEventListener("scroll", updateTop, true)
      mq.removeEventListener("change", updateTop)
    }
  }, [containerRef, enabled])

  return topPx
}
