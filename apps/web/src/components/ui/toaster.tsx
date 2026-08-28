"use client"

import {
  Button,
  HStack,
  Toaster as ChakraToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
  createToaster,
} from "@chakra-ui/react"

export const toaster = createToaster({
  placement: "top",
  pauseOnPageIdle: true,
})

type ToastMeta = {
  closable?: boolean
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => {
          const meta = toast.meta as ToastMeta | undefined
          const hasActions = Boolean(toast.action || meta?.secondaryAction)

          return (
            <Toast.Root width={{ md: "sm" }}>
              {toast.type === "loading" ? (
                <Spinner size="sm" color="blue.solid" />
              ) : (
                <Toast.Indicator />
              )}
              <Stack gap="1" flex="1" maxWidth="100%" minW={0}>
                {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
                {toast.description && (
                  <Toast.Description>{toast.description}</Toast.Description>
                )}
              </Stack>
              {hasActions && (
                <HStack gap="2" align="center" flexShrink={0} alignSelf="center">
                  {meta?.secondaryAction && (
                    <Button
                      size="xs"
                      variant="ghost"
                      color="inherit"
                      _hover={{ bg: "bg.muted" }}
                      onClick={() => {
                        meta.secondaryAction?.onClick()
                        toaster.dismiss(toast.id)
                      }}
                    >
                      {meta.secondaryAction.label}
                    </Button>
                  )}
                  {toast.action && (
                    <Button
                      size="xs"
                      variant="outline"
                      color="inherit"
                      borderColor="border"
                      _hover={{ bg: "bg.muted" }}
                      onClick={() => {
                        toast.action?.onClick?.()
                        toaster.dismiss(toast.id)
                      }}
                    >
                      {toast.action.label}
                    </Button>
                  )}
                </HStack>
              )}
              {(toast.closable || meta?.closable) && <Toast.CloseTrigger />}
            </Toast.Root>
          )
        }}
      </ChakraToaster>
    </Portal>
  )
}
