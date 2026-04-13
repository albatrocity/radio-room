import { memo, useCallback, useRef } from "react"
import { Icon, Menu, Portal, IconButton } from "@chakra-ui/react"
import { LuCamera, LuImage, LuUpload } from "react-icons/lu"

interface ImageUploadProps {
  /** Append picked images (caller enforces max count / size / auth) */
  onFilesPicked: (files: File[]) => void
  disabled?: boolean
}

/**
 * Picker UI for chat images. Uses native file inputs — Chakra FileUpload + Menu
 * composition did not reliably fire change handlers / sync state.
 */
const ImageUpload = ({ onFilesPicked, disabled = false }: ImageUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (list?.length) {
        onFilesPicked(Array.from(list))
      }
      e.target.value = ""
    },
    [onFilesPicked],
  )

  const openFilePicker = useCallback(() => {
    if (disabled) return
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }, [disabled])

  const openCamera = useCallback(() => {
    if (disabled) return
    window.setTimeout(() => cameraInputRef.current?.click(), 0)
  }, [disabled])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        style={{ display: "none" }}
        onChange={handleInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleInputChange}
      />

      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton variant="ghost" disabled={disabled} aria-label="Attach image">
            <Icon as={LuImage} />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item value="upload" disabled={disabled} onClick={openFilePicker}>
                <Icon as={LuUpload} />
                Upload
              </Menu.Item>
              <Menu.Item value="camera" disabled={disabled} onClick={openCamera}>
                <Icon as={LuCamera} />
                Take photo
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </>
  )
}

export default memo(ImageUpload)
