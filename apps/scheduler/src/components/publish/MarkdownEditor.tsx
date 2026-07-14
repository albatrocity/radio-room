import { useCallback, useMemo, useRef } from "react"
import { Editor, Viewer } from "@bytemd/react"
import gfm from "@bytemd/plugin-gfm"
import highlight from "@bytemd/plugin-highlight"
import frontmatter from "@bytemd/plugin-frontmatter"
import { Box, Button, Flex, ScrollArea, Text } from "@chakra-ui/react"
import { Prose } from "../ui/prose"
import "bytemd/dist/index.css"
import "highlight.js/styles/github.css"

type Props = {
  value: string
  onChange: (next: string) => void
  /** split = editor + markdown preview (show publish). editor-only = single pane. */
  variant?: "split" | "editor-only"
  /** ByteMD image upload (toolbar / drag / paste). Omit to keep default image URL prompt. */
  uploadImages?: (files: File[]) => Promise<{ url: string; alt?: string; title?: string }[]>
}

/**
 * ByteMD editor + optional live markdown preview pane.
 * Stored artifact is raw Markdown (sanitize on read in archive apps).
 */
export function MarkdownEditor({
  value,
  onChange,
  variant = "split",
  uploadImages,
}: Props) {
  const plugins = useMemo(() => [gfm(), highlight(), frontmatter()], [])
  /** Preview is rendered beside the editor; hide ByteMD's built-in preview pane */
  const overridePreview = useCallback(() => {}, [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const appendUploadedImages = useCallback(
    async (files: FileList | File[]) => {
      if (!uploadImages) return
      const list = Array.from(files)
      if (list.length === 0) return
      const uploaded = await uploadImages(list)
      if (uploaded.length === 0) return
      const markdown = uploaded
        .map((img) => `![${img.alt ?? ""}](${img.url})`)
        .join("\n\n")
      onChange(value.trim() ? `${value.trimEnd()}\n\n${markdown}\n` : `${markdown}\n`)
    },
    [onChange, uploadImages, value],
  )

  return (
    <Flex
      direction={{ base: "column", lg: variant === "split" ? "row" : "column" }}
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
        gap={2}
      >
        {uploadImages ? (
          <Flex align="center" gap={3} flexShrink={0}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => {
                const files = e.target.files
                if (files?.length) {
                  void appendUploadedImages(files)
                }
                e.target.value = ""
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              Add image
            </Button>
            <Text fontSize="sm" color="fg.muted">
              Or use the picture icon in the toolbar, or drag / paste into the editor
            </Text>
          </Flex>
        ) : null}
        <Box
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
          css={{
            "& .bytemd": { height: "100%", borderColor: "border.muted" },
            "& .bytemd-editor": { width: "100% !important" },
            ...(variant === "editor-only"
              ? {
                  "& .bytemd-toolbar-left .bytemd-toolbar-tab": { display: "none" },
                  "& .bytemd-preview": { display: "none !important" },
                  "& .bytemd-editor": { maxWidth: "100% !important" },
                }
              : {}),
            "& > div": { height: "100%" },
          }}
        >
          <Editor
            value={value}
            plugins={plugins}
            onChange={onChange}
            mode={variant === "editor-only" ? "tab" : "auto"}
            overridePreview={overridePreview}
            uploadImages={uploadImages}
          />
        </Box>
      </Box>
      {variant === "split" ? (
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
      ) : null}
    </Flex>
  )
}
