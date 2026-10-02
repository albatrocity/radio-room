import { Box, Button, Field, HStack, Image, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { ModelViewer } from "@repo/model-viewer"
import { useRef, useState, type DragEvent, type ReactNode } from "react"
import {
  ASSET_ACCEPT,
  type PendingSiteAsset,
  type SiteAssetKind,
  type SiteAssetStatus,
} from "../../tripMap/siteAssets"
import type { TripSiteDraft } from "../../tripMap/tripMapDraft"

type Props = {
  site: TripSiteDraft
  assetStatus: SiteAssetStatus | null
  pendingImage?: PendingSiteAsset
  pendingModel?: PendingSiteAsset
  onChange: (patch: Partial<TripSiteDraft>) => void
  onUpload: (kind: SiteAssetKind, file: File) => void
  onDiscardPending: (kind: SiteAssetKind) => void
}

const LABELS: Record<SiteAssetKind, { empty: string; hint: string }> = {
  image: {
    empty: "Drop or click to add an image",
    hint: "PNG, JPEG, WebP, AVIF, or GIF. Published as WebP, 1600px max.",
  },
  model: {
    empty: "Drop or click to add a 3D model",
    hint: "Binary glTF 2.0 (.glb), 2 MB max. Shown once visited.",
  },
}

function DropZone({
  kind,
  disabled,
  pending,
  onUpload,
  onDiscardPending,
  children,
}: {
  kind: SiteAssetKind
  disabled: boolean
  pending?: PendingSiteAsset
  onUpload: (kind: SiteAssetKind, file: File) => void
  onDiscardPending: (kind: SiteAssetKind) => void
  children: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const accept = (file: File | undefined) => {
    if (file && !disabled) onUpload(kind, file)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    accept(e.dataTransfer.files[0])
  }

  return (
    <Stack gap="1">
      <Box
        borderWidth="2px"
        borderStyle="dashed"
        borderColor={over ? "blue.solid" : pending?.status === "failed" ? "red.solid" : "border"}
        borderRadius="md"
        p="2"
        minH="140px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor={disabled ? "not-allowed" : "pointer"}
        opacity={pending?.status === "uploading" ? 0.6 : 1}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {children}
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={ASSET_ACCEPT[kind]}
          onChange={(e) => {
            accept(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </Box>
      {pending ? (
        <HStack justify="space-between" gap="2">
          <Text fontSize="xs" color={pending.status === "failed" ? "red.fg" : "fg.muted"}>
            {pending.status === "uploading" ? "Publishing to the CDN…" : pending.message}
          </Text>
          {pending.status === "failed" ? (
            <Button size="2xs" variant="ghost" onClick={() => onDiscardPending(kind)}>
              Discard
            </Button>
          ) : null}
        </HStack>
      ) : null}
    </Stack>
  )
}

/**
 * Site art (Phase 4, ADR 0205): drop or pick an image / GLB, preview it from a blob
 * URL while the dev server publishes it to the CDN, then store the CDN URL.
 */
export function TripSiteArt({
  site,
  assetStatus,
  pendingImage,
  pendingModel,
  onChange,
  onUpload,
  onDiscardPending,
}: Props) {
  const uploadsOff = assetStatus !== null && !assetStatus.configured
  const imageSrc = pendingImage?.previewUrl ?? site.imageUrl
  const modelSrc = pendingModel?.previewUrl ?? site.model?.url
  const empty = (kind: SiteAssetKind) => (
    <Text fontSize="xs" color="fg.muted" textAlign="center">
      {uploadsOff ? "Uploads unavailable" : LABELS[kind].empty}
    </Text>
  )

  return (
    <Box borderWidth="1px" borderRadius="md" p="3">
      <Text fontSize="sm" fontWeight="semibold" mb="2">
        Art
      </Text>
      {uploadsOff ? (
        <Text fontSize="xs" color="yellow.fg" mb="2">
          {assetStatus?.message} You can still paste CDN URLs below.
        </Text>
      ) : null}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
        <Stack gap="2">
          <DropZone
            kind="image"
            disabled={uploadsOff}
            pending={pendingImage}
            onUpload={onUpload}
            onDiscardPending={onDiscardPending}
          >
            {imageSrc ? (
              <Image src={imageSrc} alt={site.name} maxH="180px" objectFit="contain" borderRadius="sm" />
            ) : (
              empty("image")
            )}
          </DropZone>
          <Field.Root>
            <Field.Label fontSize="xs">Image URL</Field.Label>
            <HStack gap="1" w="full">
              <Input
                size="sm"
                placeholder="https://cdn.listeningroom.club/…"
                value={site.imageUrl ?? ""}
                onChange={(e) => onChange({ imageUrl: e.target.value.trim() || undefined })}
              />
              {site.imageUrl ? (
                <Button size="xs" variant="ghost" onClick={() => onChange({ imageUrl: undefined })}>
                  Clear
                </Button>
              ) : null}
            </HStack>
            <Field.HelperText fontSize="xs">{LABELS.image.hint}</Field.HelperText>
          </Field.Root>
        </Stack>

        <Stack gap="2">
          <DropZone
            kind="model"
            disabled={uploadsOff}
            pending={pendingModel}
            onUpload={onUpload}
            onDiscardPending={onDiscardPending}
          >
            {modelSrc ? (
              <Box w="full" maxW="220px" onClick={(e) => e.stopPropagation()}>
                <ModelViewer
                  key={modelSrc}
                  src={modelSrc}
                  alt={`${site.name} model`}
                  mode="stage"
                  spin={false}
                  fallback={
                    <Text fontSize="xs" color="fg.muted">
                      {site.icon} Model preview unavailable
                    </Text>
                  }
                />
              </Box>
            ) : (
              empty("model")
            )}
          </DropZone>
          <Field.Root>
            <Field.Label fontSize="xs">3D model URL</Field.Label>
            <HStack gap="1" w="full">
              <Input
                size="sm"
                placeholder="https://cdn.listeningroom.club/….glb"
                value={site.model?.url ?? ""}
                onChange={(e) => {
                  const url = e.target.value.trim()
                  onChange({ model: url ? { url } : undefined })
                }}
              />
              {site.model ? (
                <Button size="xs" variant="ghost" onClick={() => onChange({ model: undefined })}>
                  Clear
                </Button>
              ) : null}
            </HStack>
            <Field.HelperText fontSize="xs">{LABELS.model.hint}</Field.HelperText>
          </Field.Root>
        </Stack>
      </SimpleGrid>
    </Box>
  )
}
