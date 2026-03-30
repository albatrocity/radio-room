import { useEffect, useState } from "react"
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Spinner,
  Text,
  AbsoluteCenter,
} from "@chakra-ui/react"
import { useShow } from "../../hooks/useShows"
import { useFinalizeShowPublish, useSyncPublishPlaylist } from "../../hooks/usePublishShow"
import { MarkdownEditor } from "../../components/publish/MarkdownEditor"
import { ManagedOverflowContainer } from "../../components/layout/ManagedOverflowContainer"
import { PageContent } from "../../components/layout/PageContent"

/**
 * `/shows/$showId/publish` renders Markdown (this file). `/publish/playlist` is a child route.
 * The index file `$showId.publish.index` would only match a trailing-slash URL; links use
 * `/publish` without `/`, which left the layout Outlet empty — so the editor never appeared.
 */
export const Route = createFileRoute("/shows/$showId/publish")({
  component: PublishRoute,
})

function PublishRoute() {
  const isPlaylistStep = useRouterState({
    select: (s) => /\/publish\/playlist\/?$/.test(s.location.pathname),
  })
  if (isPlaylistStep) {
    return <Outlet />
  }
  return <ShowPublishMarkdownPage />
}

function ShowPublishMarkdownPage() {
  const { showId } = Route.useParams()
  const navigate = useNavigate()
  const { data: show, isLoading } = useShow(showId)
  const [markdown, setMarkdown] = useState("")
  const sync = useSyncPublishPlaylist(showId)
  const finalize = useFinalizeShowPublish(showId)

  useEffect(() => {
    if (show?.roomExport?.markdown != null) {
      setMarkdown(show.roomExport.markdown)
    }
  }, [show?.roomExport?.markdown, show?.roomExport?.updatedAt])

  if (isLoading) {
    return (
      <PageContent>
        <AbsoluteCenter>
          <Spinner />
        </AbsoluteCenter>
      </PageContent>
    )
  }

  if (!show) {
    return (
      <PageContent>
        <Text>Show not found.</Text>
        <Link to="/shows">Back to shows</Link>
      </PageContent>
    )
  }

  const hasExport = !!show.roomExport
  const serverMarkdownEmpty = !(show.roomExport?.markdown ?? "").trim()
  const isReady = show.status === "ready"
  const isPublished = show.status === "published"

  const needsSyncFirst = isReady && !hasExport
  const needsPlaylistContinue = isReady && hasExport && serverMarkdownEmpty

  return (
    <ManagedOverflowContainer>
      <Flex direction="column" flex="1" minH={0} minW={0} gap={4}>
        <Box flexShrink={0}>
          <HStack mb={2} flexWrap="wrap" gap={2}>
            {isReady && (
              <Link to="/shows/$showId/publish/playlist" params={{ showId }}>
                <Button size="sm" variant="ghost">
                  Playlist step
                </Button>
              </Link>
            )}
            <Link to="/shows/$showId" params={{ showId }}>
              <Button size="sm" variant="ghost">
                Back to show
              </Button>
            </Link>
          </HStack>
          <Heading size="lg" mb={2}>
            {isPublished ? "Edit published archive" : `Publish show: ${show.title}`}
          </Heading>
          <Text fontSize="sm" color="fg.muted" mb={4}>
            Markdown is stored as raw source. Any separate archive app that renders it must sanitize
            HTML output (or disable raw HTML).
          </Text>
        </Box>

        {needsSyncFirst ? (
          <Box flexShrink={0}>
            <Text fontSize="sm" color="fg.muted" mb={3}>
              Start by syncing the live room playlist into a draft export, then review tracks before
              Markdown is generated.
            </Text>
            <Button
              loading={sync.isPending}
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: (data) => {
                    navigate({
                      to: "/shows/$showId/publish/playlist",
                      params: { showId },
                      state: { playlistItems: data.playlistItems } as {
                        playlistItems: typeof data.playlistItems
                      },
                    })
                  },
                })
              }
            >
              Sync playlist from room
            </Button>
          </Box>
        ) : needsPlaylistContinue ? (
          <Box flexShrink={0}>
            <Text fontSize="sm" color="fg.muted" mb={3}>
              Review and confirm the track list (or resync from the room), then continue to generate
              archive Markdown.
            </Text>
            <Link to="/shows/$showId/publish/playlist" params={{ showId }}>
              <Button>Open playlist editor</Button>
            </Link>
          </Box>
        ) : (
          <>
            <MarkdownEditor value={markdown} onChange={setMarkdown} />
            <Flex direction="row" flexShrink={0} justifyContent="flex-end">
              <Button
                loading={finalize.isPending}
                onClick={() =>
                  finalize.mutate(markdown, {
                    onSuccess: () => {
                      navigate({ to: "/shows/$showId", params: { showId } })
                    },
                  })
                }
              >
                {isPublished ? "Save archive" : "Publish show"}
              </Button>
            </Flex>
          </>
        )}
      </Flex>
    </ManagedOverflowContainer>
  )
}
