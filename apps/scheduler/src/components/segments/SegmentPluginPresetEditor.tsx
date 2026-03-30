import { useCallback, useEffect, useRef, useState } from "react"
import { Box, Button, HStack, Text, Textarea } from "@chakra-ui/react"
import { validatePreset } from "@repo/utils"
import type { PluginPreset } from "@repo/types"

export interface SegmentPluginPresetEditorProps {
  value: PluginPreset | null
  onChange: (next: PluginPreset | null) => void
}

export function SegmentPluginPresetEditor({ value, onChange }: SegmentPluginPresetEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    setDraft(value ? JSON.stringify(value, null, 2) : "")
    setError(null)
  }, [value])

  const runValidate = useCallback(() => {
    const raw = draft.trim()
    if (raw === "") {
      setError(null)
      onChange(null)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setError("Invalid JSON")
      return
    }
    const result = validatePreset(parsed)
    if (!result.valid) {
      setError(result.error ?? "Invalid preset")
      return
    }
    setError(null)
    onChange(result.preset ?? null)
  }, [draft, onChange])

  const clear = useCallback(() => {
    setDraft("")
    setError(null)
    onChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [onChange])

  const onFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".json") && file.type && file.type !== "application/json") {
      setError("Please select a .json file")
      return
    }
    void file
      .text()
      .then((text) => {
        setDraft(text)
        setError(null)
      })
      .catch(() => setError("Failed to read file"))
  }, [])

  return (
    <Box>
      <Box mb={1} fontSize="sm" fontWeight="medium">
        Plugin preset (optional)
      </Box>
      <Text fontSize="xs" color="fg.muted" mb={2}>
        Paste or drop a preset JSON export from room admin. Must match the plugin preset format (version
        1).
      </Text>

      {value ? (
        <Box
          mb={3}
          p={3}
          borderRadius="md"
          borderWidth="1px"
          borderColor="border.muted"
          bg="bg.subtle"
        >
          <Text fontSize="sm" fontWeight="medium">
            {value.presetName}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            Exported {value.exportedAt}
          </Text>
        </Box>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />

      <Box
        mb={2}
        p={3}
        borderRadius="md"
        borderWidth="2px"
        borderStyle="dashed"
        borderColor={dragOver ? "blue.solid" : "border.muted"}
        transition="border-color 0.15s"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
      >
        <HStack gap={1} mb={2} fontSize="sm" flexWrap="wrap" alignItems="center">
          <Text as="span">Drop a .json file here or</Text>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            colorPalette="blue"
            onClick={() => fileInputRef.current?.click()}
          >
            choose file
          </Button>
        </HStack>
        <Textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          placeholder='{"presetName":"…","exportedAt":"…","version":1,"pluginConfigs":{…}}'
          rows={8}
          fontFamily="mono"
          fontSize="sm"
        />
      </Box>

      {error ? (
        <Text fontSize="sm" color="red.500" mb={2}>
          {error}
        </Text>
      ) : null}

      <HStack gap={2}>
        <Button type="button" size="sm" variant="outline" onClick={runValidate}>
          Validate
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clear}
          disabled={!value && draft.trim() === ""}
        >
          Clear preset
        </Button>
      </HStack>
    </Box>
  )
}
