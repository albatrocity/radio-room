import type { ReactNode } from "react"
import { DialogContent, DialogRoot } from "@chakra-ui/react"

/**
 * Admin settings sub-pages use Chakra `DialogBody` / `DialogFooter`, which require
 * `Dialog.Root` context. In the integrated panel we are not inside the settings
 * modal shell, so provide a non-modal in-flow dialog context instead.
 */
export function AdminSettingsDialogContext({ children }: { children: ReactNode }) {
  return (
    <DialogRoot
      open
      modal={false}
      trapFocus={false}
      closeOnInteractOutside={false}
      closeOnEscape={false}
      preventScroll={false}
      lazyMount={false}
      unmountOnExit={false}
      scrollBehavior="inside"
    >
      <DialogContent
        bg="transparent"
        boxShadow="none"
        maxW="none"
        w="full"
        m={0}
        p={0}
        maxH="none"
        overflow="visible"
      >
        {children}
      </DialogContent>
    </DialogRoot>
  )
}
