import { HStack, Icon } from "@chakra-ui/react"
import { Select, SingleValue } from "chakra-react-select"
import { MetadataSourceType } from "@repo/types"
import { FaSpotify } from "react-icons/fa"
import { SiTidal, SiApplemusic } from "react-icons/si"
import { IconType } from "react-icons"

interface ServiceConfig {
  label: string
  icon: IconType
  color: string
}

export const serviceConfig: Record<MetadataSourceType, ServiceConfig> = {
  spotify: { label: "Spotify", icon: FaSpotify, color: "green.400" },
  tidal: { label: "Tidal", icon: SiTidal, color: "cyan.400" },
  applemusic: { label: "Apple Music", icon: SiApplemusic, color: "pink.400" },
}

interface ServiceOption {
  value: MetadataSourceType
  label: string
}

interface ServiceSelectProps {
  value: MetadataSourceType
  onChange: (service: MetadataSourceType) => void
  availableServices: MetadataSourceType[]
  size?: "sm" | "md" | "lg"
  showIcon?: boolean
}

export function ServiceSelect({
  value,
  onChange,
  availableServices,
  size = "sm",
  showIcon = true,
}: ServiceSelectProps) {
  const currentConfig = serviceConfig[value] || serviceConfig.spotify

  const options: ServiceOption[] = availableServices.map((service) => ({
    value: service,
    label: serviceConfig[service]?.label || service,
  }))

  const selectedOption = options.find((opt) => opt.value === value) || options[0]

  const handleChange = (newValue: SingleValue<ServiceOption>) => {
    if (newValue) {
      onChange(newValue.value)
    }
  }

  return (
    <HStack gap={1}>
      {showIcon && (
        <Icon as={currentConfig.icon} boxSize={size === "sm" ? 4 : 5} color={currentConfig.color} />
      )}
      <Select<ServiceOption>
        value={selectedOption}
        onChange={handleChange}
        options={options}
        size={size}
        isSearchable={false}
        chakraStyles={{
          container: (provided) => ({
            ...provided,
            minWidth: "120px",
          }),
        }}
      />
    </HStack>
  )
}

export default ServiceSelect
