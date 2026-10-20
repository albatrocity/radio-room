import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  Image,
  Input,
  NativeSelect,
  Stack,
  TagsInput,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { physicalMediaStockOf } from "@repo/road-trip-map"
import {
  MAX_RECORD_PICKS,
  normalizeGenres,
  PHYSICAL_MEDIA_FORMATS,
  type PhysicalMediaCarry,
  type PhysicalMediaFormat,
  type PhysicalMediaPick,
  type PhysicalMediaStock,
} from "@repo/types"
import { useEffect, useState } from "react"
import {
  fetchStudioRecordPick,
  searchStudioRecords,
  studioRecordCover,
  type StudioRecordSearch,
} from "../../studio/bridgeClient"
import {
  formatCheckLabel,
  PICK_SOURCE_LABEL,
  pickKey,
  studioBridgeUrl,
} from "../../tripMap/tripMapDraft"

type Props = {
  stock: PhysicalMediaStock | PhysicalMediaCarry | undefined
  /** `undefined` turns the service off. */
  onChange: (stock: PhysicalMediaStock | undefined) => void
}

const MAX_GENRES = 12
const MAX_GENRE_LENGTH = 60
const SEARCH_DEBOUNCE_MS = 300
const SPOTIFY_ALBUM_LINK = /(open\.spotify\.com\/(?:intl-[a-z-]+\/)?album\/|spotify:album:)/i

/**
 * "Sells physical media" under a site's Services (ADR 0214, 0216): records from
 * the room's library, narrowed by format and genre, plus picked albums.
 */
export function TripPhysicalMediaService({ stock: authored, onChange }: Props) {
  const stock = physicalMediaStockOf(authored)
  const library = stock?.library
  const picks = stock?.picks ?? []

  const update = (next: PhysicalMediaStock) =>
    onChange({
      ...(next.library ? { library: next.library } : {}),
      ...(next.picks?.length ? { picks: next.picks } : {}),
    })

  return (
    <Stack gap="2">
      <Checkbox.Root
        size="sm"
        checked={stock !== undefined}
        onCheckedChange={(d) => onChange(d.checked === true ? { library: {} } : undefined)}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Sells physical media</Checkbox.Label>
      </Checkbox.Root>
      {stock ? (
        <Stack gap="3" ps="6">
          <LibraryBin
            library={library}
            onChange={(next) => update({ picks, ...(next ? { library: next } : {}) })}
          />
          <PickedAlbums picks={picks} onChange={(next) => update({ library, picks: next })} />
          {!library && picks.length === 0 ? (
            <Text fontSize="xs" color="orange.fg">
              Sells nothing yet: sell from the library or pick some albums.
            </Text>
          ) : (
            <Text fontSize="xs" color="fg.muted">
              Each traveler sees 3 records drawn from both. Other goods go under Shop.
            </Text>
          )}
        </Stack>
      ) : null}
    </Stack>
  )
}

function LibraryBin({
  library,
  onChange,
}: {
  library: PhysicalMediaCarry | undefined
  onChange: (library: PhysicalMediaCarry | undefined) => void
}) {
  const formats = library?.formats ?? []
  const genres = library?.genres ?? []

  const update = (next: PhysicalMediaCarry) =>
    onChange({
      ...(next.formats?.length ? { formats: next.formats } : {}),
      ...(next.genres?.length ? { genres: next.genres } : {}),
    })

  const toggleFormat = (format: PhysicalMediaFormat, checked: boolean) =>
    update({
      genres,
      formats: PHYSICAL_MEDIA_FORMATS.filter((f) => (f === format ? checked : formats.includes(f))),
    })

  return (
    <Stack gap="2">
      <Checkbox.Root
        size="sm"
        checked={library !== undefined}
        onCheckedChange={(d) => onChange(d.checked === true ? {} : undefined)}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>From the room&apos;s library</Checkbox.Label>
      </Checkbox.Root>
      {library ? (
        <Stack gap="2" ps="6">
          <HStack gap="4" flexWrap="wrap">
            {PHYSICAL_MEDIA_FORMATS.map((format) => (
              <Checkbox.Root
                key={format}
                size="sm"
                checked={formats.includes(format)}
                onCheckedChange={(d) => toggleFormat(format, d.checked === true)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>{formatCheckLabel(format)}</Checkbox.Label>
              </Checkbox.Root>
            ))}
          </HStack>
          <Field.Root>
            <TagsInput.Root
              size="sm"
              max={MAX_GENRES}
              blurBehavior="add"
              validate={(d) => d.inputValue.trim().length <= MAX_GENRE_LENGTH}
              value={genres}
              onValueChange={(d) => update({ formats, genres: normalizeGenres(d.value) })}
            >
              <TagsInput.Label fontSize="xs">Genres</TagsInput.Label>
              <TagsInput.Control>
                <TagsInput.Items />
                <TagsInput.Input placeholder="Country, Jazz…" />
              </TagsInput.Control>
            </TagsInput.Root>
            <Field.HelperText fontSize="xs">
              {formats.length === 0 && genres.length === 0
                ? "Sells every record in the room's library."
                : "Genres must match the album's Navidrome genre."}
            </Field.HelperText>
          </Field.Root>
        </Stack>
      ) : null}
    </Stack>
  )
}

function PickedAlbums({
  picks,
  onChange,
}: {
  picks: PhysicalMediaPick[]
  onChange: (picks: PhysicalMediaPick[]) => void
}) {
  const bridge = studioBridgeUrl()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState<StudioRecordSearch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const full = picks.length >= MAX_RECORD_PICKS
  const picked = new Set(picks.map((p) => `${p.source}:${p.id}`))

  useEffect(() => {
    const text = query.trim()
    if (!text || SPOTIFY_ALBUM_LINK.test(text)) {
      setSearch(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      searchStudioRecords(bridge, text)
        .then((result) => {
          if (cancelled) return
          setSearch(result)
          setError(null)
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Search failed")
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, bridge])

  const add = async (source: PhysicalMediaPick["source"], id: string) => {
    setAdding(`${source}:${id}`)
    try {
      const pick = await fetchStudioRecordPick(bridge, source, id)
      if (!picks.some((p) => pickKey(p) === pickKey(pick))) onChange([...picks, pick])
      setQuery("")
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't add that album")
    } finally {
      setAdding(null)
    }
  }

  const replace = (index: number, next: PhysicalMediaPick) =>
    onChange(picks.map((p, i) => (i === index ? next : p)))

  return (
    <Stack gap="2">
      <Text fontSize="sm">Picked albums</Text>
      {picks.map((pick, index) => (
        <PickRow
          key={`${pick.source}:${pick.id}:${index}`}
          pick={pick}
          cover={studioRecordCover(bridge, pick)}
          onChange={(next) => replace(index, next)}
          onRemove={() => onChange(picks.filter((_, i) => i !== index))}
        />
      ))}
      <Field.Root>
        <HStack gap="2" w="full">
          <Input
            size="sm"
            flex="1"
            value={query}
            disabled={full}
            placeholder={
              full ? `Up to ${MAX_RECORD_PICKS} picks` : "Search albums or paste a Spotify link"
            }
            onChange={(e) => setQuery(e.target.value)}
          />
          {SPOTIFY_ALBUM_LINK.test(query) ? (
            <Button
              size="sm"
              loading={adding !== null}
              onClick={() => void add("spotify", query.trim())}
            >
              Add
            </Button>
          ) : null}
        </HStack>
        {error ? <Field.HelperText color="red.fg">{error}</Field.HelperText> : null}
      </Field.Root>
      {search?.unavailable.map((u) => (
        <Text key={u.source} fontSize="xs" color="fg.muted">
          {PICK_SOURCE_LABEL[u.source]} search is off: {u.reason}
        </Text>
      ))}
      {search && query.trim() ? (
        <Stack gap="1" maxH="240px" overflowY="auto">
          {search.results.length === 0 ? (
            <Text fontSize="xs" color="fg.muted">
              No albums found.
            </Text>
          ) : (
            search.results.map((hit) => {
              const key = `${hit.source}:${hit.id}`
              return (
                <HStack key={key} gap="2">
                  <Cover src={hit.coverUrl} />
                  <Box flex="1" minW={0}>
                    <Text fontSize="sm" lineClamp={1}>
                      {hit.title}
                    </Text>
                    <Text fontSize="xs" color="fg.muted" lineClamp={1}>
                      {[hit.artist, hit.year, `${hit.trackCount} tracks`]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Box>
                  <Badge size="sm">{PICK_SOURCE_LABEL[hit.source]}</Badge>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={full || picked.has(key)}
                    loading={adding === key}
                    onClick={() => void add(hit.source, hit.id)}
                  >
                    {picked.has(key) ? "Picked" : "Add"}
                  </Button>
                </HStack>
              )
            })
          )}
        </Stack>
      ) : null}
    </Stack>
  )
}

function PickRow({
  pick,
  cover,
  onChange,
  onRemove,
}: {
  pick: PhysicalMediaPick
  cover: string | undefined
  onChange: (pick: PhysicalMediaPick) => void
  onRemove: () => void
}) {
  return (
    <Stack gap="1" borderWidth="1px" borderRadius="sm" p="2">
      <HStack gap="2">
        <Cover src={cover} />
        <Box flex="1" minW={0}>
          <Text fontSize="sm" lineClamp={1}>
            {pick.title}
          </Text>
          <Text fontSize="xs" color="fg.muted" lineClamp={1}>
            {[pick.artist, pick.year].filter(Boolean).join(" · ")}
          </Text>
        </Box>
        <Badge size="sm">{PICK_SOURCE_LABEL[pick.source]}</Badge>
        <NativeSelect.Root size="xs" width="88px">
          <NativeSelect.Field
            aria-label="Format"
            value={pick.format ?? ""}
            onChange={(e) => onChange({ ...pick, format: e.target.value as PhysicalMediaFormat })}
          >
            {PHYSICAL_MEDIA_FORMATS.map((format) => (
              <option key={format} value={format}>
                {formatCheckLabel(format)}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Button size="xs" variant="ghost" onClick={onRemove} aria-label={`Remove ${pick.title}`}>
          Remove
        </Button>
      </HStack>
      <Textarea
        size="xs"
        rows={2}
        value={pick.lore ?? ""}
        placeholder={
          pick.source === "local" ? "Lore (blank uses the album's library comment)" : "Lore"
        }
        onChange={(e) => {
          const lore = e.target.value
          const { lore: _old, ...rest } = pick
          onChange(lore.trim() ? { ...rest, lore } : rest)
        }}
      />
    </Stack>
  )
}

function Cover({ src }: { src: string | undefined }) {
  return src ? (
    <Image src={src} alt="" boxSize="36px" borderRadius="sm" objectFit="cover" flexShrink={0} />
  ) : (
    <Box boxSize="36px" borderRadius="sm" bg="bg.muted" flexShrink={0} />
  )
}
