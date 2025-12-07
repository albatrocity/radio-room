import React, { FormEvent, useEffect, useRef } from "react"
import { Box, Button, HStack, Text, Input } from "@chakra-ui/react"
import { MetadataSourceType } from "@repo/types"
import { ServiceSelect, serviceConfig } from "../ServiceSelect"

interface Props {
  isEditing: boolean
  onEdit: () => void
  onSave: (event: FormEvent) => void
  isLoading: boolean
  onChange: (name: string) => void
  value: string | undefined
  trackCount: number
  availableServices: MetadataSourceType[]
  targetService: MetadataSourceType
  onServiceChange: (service: MetadataSourceType) => void
}

const DrawerPlaylistFooter = ({
  isEditing,
  onEdit,
  onSave,
  isLoading,
  onChange,
  value,
  trackCount,
  availableServices,
  targetService,
  onServiceChange,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing, inputRef.current])

  return (
    <Box as="form" onSubmit={onSave} w="100%">
      <Box w="100%">
        {isEditing ? (
          <HStack justifyContent="space-between" w="100%" flexWrap="wrap" gap={2}>
            <Button onClick={onEdit} variant="ghost">
              Cancel
            </Button>
            <HStack flexWrap="wrap" gap={2}>
              <Box flexShrink={0}>
                <Text fontSize="sm">{trackCount} Tracks</Text>
              </Box>
              <Input
                name="name"
                placeholder="Playlist name"
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                ref={inputRef}
                size="sm"
                w="auto"
                minW="150px"
              />
              {availableServices.length > 1 && (
                <ServiceSelect
                  value={targetService}
                  onChange={onServiceChange}
                  availableServices={availableServices}
                  size="sm"
                />
              )}
              <Button
                onClick={onSave}
                loading={isLoading}
                disabled={isLoading || trackCount === 0}
                type="submit"
                size="sm"
              >
                Save to {serviceConfig[targetService]?.label || targetService}
              </Button>
            </HStack>
          </HStack>
        ) : (
          <HStack justifyContent="end">
            <Button variant="outline" onClick={onEdit}>
              Save Playlist
            </Button>
          </HStack>
        )}
      </Box>
    </Box>
  )
}

export default DrawerPlaylistFooter
