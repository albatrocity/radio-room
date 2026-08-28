"use client"

import {
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
                    <Toast.ActionTrigger
                      onClick={() => {
                        meta.secondaryAction?.onClick()
                        toaster.dismiss(toast.id)
                      }}
                      css={{ borderWidth: 0, color: "inherit" }}
                    >
                      {meta.secondaryAction.label}
                    </Toast.ActionTrigger>
                  )}
                  {toast.action && (
                    <Toast.ActionTrigger
                      onClick={() => {
                        toast.action?.onClick?.()
                        toaster.dismiss(toast.id)
                      }}
                      css={{ color: "inherit" }}
                    >
                      {toast.action.label}
                    </Toast.ActionTrigger>
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
