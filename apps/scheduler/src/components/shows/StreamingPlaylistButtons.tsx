import type { SVGProps } from "react"
import { HStack, Icon, Link as ChakraLink } from "@chakra-ui/react"
import type { RoomExportPlaylistLinks } from "@repo/types"

function SpotifyLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="1em" height="1em" {...props}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}

function TidalLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="1em" height="1em" {...props}>
      <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996h8.004L12.012 12l4.004-4.004H20.02L16.016 3.992l-4.004 4.004-4.004-4.004zm4.003 8.004l4.004-4.004h-4.004V8L12.012 12 8.008 8v4.004H4.004l4.004 4.004h8.004l4.004-4.004z" />
    </svg>
  )
}

type Props = {
  playlistLinks: RoomExportPlaylistLinks | null | undefined
}

/**
 * External open-in-app buttons for archived show playlists (Spotify / Tidal).
 */
export function StreamingPlaylistButtons({ playlistLinks }: Props) {
  const spotify = playlistLinks?.spotify
  const tidal = playlistLinks?.tidal
  const spotifyUrl = spotify?.url
  const tidalUrl = tidal?.url
  if (!spotifyUrl && !tidalUrl) return null

  const spotifyLabel = spotify?.title?.trim() || "Open in Spotify"
  const tidalLabel = tidal?.title?.trim() || "Open in Tidal"

  const linkButtonProps = {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 2,
    px: 3,
    h: 8,
    fontSize: "sm",
    fontWeight: "medium" as const,
    borderRadius: "md",
    textDecoration: "none",
    transition: "background 0.15s ease",
  }

  return (
    <HStack gap={2} flexWrap="wrap" alignItems="center" mb={3}>
      {spotifyUrl ? (
        <ChakraLink
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          {...linkButtonProps}
          bg="#1DB954"
          color="white"
          _hover={{ bg: "#1ed760", textDecoration: "none" }}
        >
          <Icon boxSize="1.1em" flexShrink={0}>
            <SpotifyLogo />
          </Icon>
          {spotifyLabel}
        </ChakraLink>
      ) : null}
      {tidalUrl ? (
        <ChakraLink
          href={tidalUrl}
          target="_blank"
          rel="noopener noreferrer"
          {...linkButtonProps}
          bg="black"
          color="white"
          _hover={{ bg: "gray.800", textDecoration: "none" }}
        >
          <Icon boxSize="1.1em" flexShrink={0}>
            <TidalLogo />
          </Icon>
          {tidalLabel}
        </ChakraLink>
      ) : null}
    </HStack>
  )
}
