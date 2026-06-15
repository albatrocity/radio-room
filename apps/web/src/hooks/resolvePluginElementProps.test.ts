import { describe, it, expect } from "vitest"
import { resolvePluginElementProps } from "./resolvePluginElementProps"

const GTT_PLUGIN = "guess-the-tune"

function inclusivePluginData(userReveals: Record<string, unknown>) {
  return {
    [GTT_PLUGIN]: {
      elementProps: {
        artwork: { obscured: true },
        artist: { obscured: true, placeholder: "???" },
        album: { obscured: true, placeholder: "???" },
        title: { obscured: true, placeholder: "???" },
      },
      userReveals,
    },
  }
}

describe("resolvePluginElementProps userReveals (inclusive mode)", () => {
  const enabledPlugins = new Set([GTT_PLUGIN])
  const pluginConfigs = {
    [GTT_PLUGIN]: { enabled: true, matchTitle: true, matchArtist: true, matchAlbum: true },
  }

  it("unobscures artist and album for the viewer with per-user reveals", () => {
    const pluginData = inclusivePluginData({
      u1: {
        artist: { userId: "u1", username: "Alice", at: 1 },
        album: { userId: "u1", username: "Alice", at: 2 },
      },
    })

    const artist = resolvePluginElementProps({
      pluginData,
      element: "artist",
      viewerUserId: "u1",
      viewerRoles: [],
      enabledPlugins,
      pluginConfigs,
    })
    const album = resolvePluginElementProps({
      pluginData,
      element: "album",
      viewerUserId: "u1",
      viewerRoles: [],
      enabledPlugins,
      pluginConfigs,
    })

    expect(artist.obscured).toBe(false)
    expect(artist.revealedBy?.userId).toBe("u1")
    expect(album.obscured).toBe(false)
  })

  it("unobscures artwork for the viewer once they have revealed artist and album", () => {
    const pluginData = inclusivePluginData({
      u1: {
        artist: { userId: "u1", username: "Alice", at: 1 },
        album: { userId: "u1", username: "Alice", at: 2 },
      },
    })

    const artworkForViewer = resolvePluginElementProps({
      pluginData,
      element: "artwork",
      viewerUserId: "u1",
      viewerRoles: [],
      enabledPlugins,
      pluginConfigs,
    })
    const artworkForOther = resolvePluginElementProps({
      pluginData,
      element: "artwork",
      viewerUserId: "u2",
      viewerRoles: [],
      enabledPlugins,
      pluginConfigs,
    })

    expect(artworkForViewer.obscured).toBe(false)
    expect(artworkForOther.obscured).toBe(true)
  })

  it("keeps artwork obscured when only one of artist or album is revealed for the viewer", () => {
    const pluginData = inclusivePluginData({
      u1: {
        artist: { userId: "u1", username: "Alice", at: 1 },
      },
    })

    const artwork = resolvePluginElementProps({
      pluginData,
      element: "artwork",
      viewerUserId: "u1",
      viewerRoles: [],
      enabledPlugins,
      pluginConfigs,
    })

    expect(artwork.obscured).toBe(true)
  })
})
