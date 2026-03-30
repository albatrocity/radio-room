import { useCallback, useMemo } from "react"
import { Editor, Viewer } from "@bytemd/react"
import gfm from "@bytemd/plugin-gfm"
import highlight from "@bytemd/plugin-highlight"
import frontmatter from "@bytemd/plugin-frontmatter"
import { Box, Flex, ScrollArea } from "@chakra-ui/react"
import { Prose } from "../ui/prose"
import "bytemd/dist/index.css"
import "highlight.js/styles/github.css"

type Props = {
  value: string
  onChange: (next: string) => void
}

/**
 * ByteMD editor + live preview. Fills parent flex height; preview scrolls inside ScrollArea.
 * Stored artifact is raw Markdown (sanitize on read in archive apps).
 */
export function MarkdownEditor({ value, onChange }: Props) {
  const plugins = useMemo(() => [gfm(), highlight(), frontmatter()], [])
  /** Preview is rendered beside the editor; hide ByteMD's built-in preview pane */
  const overridePreview = useCallback(() => {}, [])

  return (
    <Flex
      direction={{ base: "column", lg: "row" }}
      gap={4}
      align="stretch"
      flex="1"
      minH={0}
      minW={0}
    >
      <Box
        flex="1"
        minH={0}
        minW={0}
        className="bytemd-editor-pane"
        overflow="hidden"
        display="flex"
        height="100%"
        flexDirection="column"
        css={{
          "& .bytemd": { height: "100%", borderColor: "border.muted" },
          // "& .bytemd-preview": { display: "none !important" },
          "& .bytemd-editor": { width: "100% !important" },
          "& > div": { height: "100%" },
        }}
      >
        <Editor
          value={value}
          plugins={plugins}
          onChange={onChange}
          overridePreview={overridePreview}
        />
      </Box>
      <Box
        flex="1"
        minH={0}
        minW={0}
        borderWidth="1px"
        borderColor="border.muted"
        borderRadius="md"
        overflow="hidden"
        bg="bg.subtle"
        display="flex"
        flexDirection="column"
      >
        <ScrollArea.Root flex="1" minH={0} w="100%">
          <ScrollArea.Viewport h="100%">
            <Box p={4}>
              <Prose size="md">
                <Viewer value={value} plugins={plugins} />
              </Prose>
            </Box>
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </Box>
    </Flex>
  )
}
