import { useEffect, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Box, Button, Flex, Heading, HStack, Spinner, Text, AbsoluteCenter } from "@chakra-ui/react"
import { useShow } from "../../hooks/useShows"
import { useFinalizeShowPublish, usePrepareShowPublish } from "../../hooks/usePublishShow"
import { MarkdownEditor } from "../../components/publish/MarkdownEditor"
import { ManagedOverflowContainer } from "../../components/layout/ManagedOverflowContainer"
import { PageContent } from "../../components/layout/PageContent"

export const Route = createFileRoute("/shows/$showId/publish")({
  component: ShowPublishPage,
})

function ShowPublishPage() {
  const { showId } = Route.useParams()
  const navigate = useNavigate()
  const { data: show, isLoading } = useShow(showId)
  const [markdown, setMarkdown] = useState("")
  const prepare = usePrepareShowPublish(showId)
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
  const needsPrepare = show.status === "ready" && !hasExport

  return (
    <ManagedOverflowContainer>
      <Flex direction="column" flex="1" minH={0} minW={0} gap={4}>
        <Box flexShrink={0}>
          <Heading size="lg" mb={2}>
            {show.status === "published" ? "Edit published archive" : `Publish show: ${show.title}`}
          </Heading>
          <Text fontSize="sm" color="fg.muted" mb={4}>
            Markdown is stored as raw source. Any separate archive app that renders it must sanitize
            HTML output (or disable raw HTML).
          </Text>
        </Box>

        {needsPrepare ? (
          <Box flexShrink={0}>
            <Button
              loading={prepare.isPending}
              onClick={() =>
                prepare.mutate(undefined, {
                  onSuccess: (data) => {
                    setMarkdown(data.export.markdown)
                  },
                })
              }
            >
              Generate export from room
            </Button>
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
                {show.status === "published" ? "Save archive" : "Publish show"}
              </Button>
            </Flex>
          </>
        )}
      </Flex>
    </ManagedOverflowContainer>
  )
}
