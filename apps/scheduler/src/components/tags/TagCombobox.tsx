import { useMemo, useState } from "react"
import {
  Box,
  Combobox,
  createListCollection,
  Portal,
  Spinner,
  Tag,
  Wrap,
} from "@chakra-ui/react"
import type { TagType } from "@repo/types"
import { useCreateTag, useTags } from "../../hooks/useTags"

const NEW_ITEM_VALUE = "[[new]]"

type TagListItem = { label: string; value: string }

export interface TagComboboxProps {
  tagType: TagType
  value: string[]
  onValueChange: (tagIds: string[]) => void
  disabled?: boolean
  /** Dialog / drawer: avoid Portal on positioner; use fixed positioning */
  insideOverlay?: boolean
  label?: string
  /** When false, only existing tags can be selected (no “create” row or API). Default true. */
  allowCreate?: boolean
}

export function TagCombobox({
  tagType,
  value,
  onValueChange,
  disabled,
  insideOverlay = false,
  label = "Tags",
  allowCreate = true,
}: TagComboboxProps) {
  const { data: tags = [], isLoading } = useTags(tagType)
  const createTag = useCreateTag()
  const [query, setQuery] = useState("")

  const itemsForList = useMemo((): TagListItem[] => {
    const base = tags.map((t) => ({ label: t.name, value: t.id }))
    const q = query.trim().toLowerCase()
    const filtered =
      q === "" ? base : base.filter((t) => t.label.toLowerCase().includes(q))
    if (!allowCreate) return filtered
    const exact = base.some((t) => t.label.toLowerCase() === q)
    const canCreate = query.trim().length > 0 && !exact
    if (canCreate) {
      return [{ label: query.trim(), value: NEW_ITEM_VALUE }, ...filtered]
    }
    return filtered
  }, [tags, query, allowCreate])

  const collection = useMemo(
    () =>
      createListCollection({
        items: itemsForList,
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
      }),
    [itemsForList],
  )

  const positioning = insideOverlay
    ? { strategy: "fixed" as const, placement: "bottom-start" as const, hideWhenDetached: true }
    : undefined

  async function handleValueChange(details: { value: string[] }) {
    const next = details.value
    if (next.includes(NEW_ITEM_VALUE)) {
      const row = itemsForList.find((i) => i.value === NEW_ITEM_VALUE)
      const name = row?.label ?? query.trim()
      if (!name) return
      try {
        const created = await createTag.mutateAsync({ name, type: tagType })
        const rest = next.filter((v) => v !== NEW_ITEM_VALUE)
        onValueChange([...new Set([...rest, created.id])])
        setQuery("")
      } catch {
        onValueChange([...value])
      }
      return
    }
    onValueChange(next)
  }

  const positioner = (
    <Combobox.Positioner>
      <Combobox.Content>
        <Combobox.Empty>No tags match</Combobox.Empty>
        {itemsForList.map((item) => (
          <Combobox.Item key={item.value} item={item}>
            {item.value === NEW_ITEM_VALUE ? (
              <Combobox.ItemText>{`+ Create "${item.label}"`}</Combobox.ItemText>
            ) : (
              <Combobox.ItemText>{item.label}</Combobox.ItemText>
            )}
            <Combobox.ItemIndicator />
          </Combobox.Item>
        ))}
      </Combobox.Content>
    </Combobox.Positioner>
  )

  return (
    <Box>
      <Combobox.Root
        multiple
        closeOnSelect
        collection={collection}
        value={value}
        onValueChange={handleValueChange}
        onInputValueChange={(e) => setQuery(e.inputValue)}
        disabled={disabled || (allowCreate && createTag.isPending)}
        allowCustomValue={allowCreate}
        openOnClick
        positioning={positioning}
      >
        <Box mb={1} fontSize="sm" fontWeight="medium">
          {label}
        </Box>
        {isLoading && tags.length === 0 ? (
          <Spinner size="sm" />
        ) : (
          <>
            <Wrap gap="2" mb={2}>
              {value.map((id) => {
                const t = tags.find((x) => x.id === id)
                const label = t?.name ?? id
                return (
                  <Tag.Root key={id} size="sm">
                    <Tag.Label>{label}</Tag.Label>
                    {!disabled && !(allowCreate && createTag.isPending) && (
                      <Tag.EndElement>
                        <Tag.CloseTrigger
                          aria-label={`Remove ${label}`}
                          onClick={() =>
                            onValueChange(value.filter((v) => v !== id))
                          }
                        />
                      </Tag.EndElement>
                    )}
                  </Tag.Root>
                )
              })}
            </Wrap>
            <Combobox.Control>
              <Combobox.Input
                placeholder={
                  allowCreate ? "Search or create tags…" : "Search tags…"
                }
              />
              <Combobox.IndicatorGroup>
                <Combobox.ClearTrigger />
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            {insideOverlay ? positioner : <Portal>{positioner}</Portal>}
          </>
        )}
      </Combobox.Root>
    </Box>
  )
}
