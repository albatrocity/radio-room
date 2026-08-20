/**
 * Room-level host for shared plugin component actors and modal UI.
 *
 * Ensures one pluginComponentMachine (+ socket sub + HTTP fetch) per pluginName,
 * independent of how many PluginArea rows render that plugin.
 */

import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogCloseTrigger,
  CloseButton,
  VStack,
  Portal,
} from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import { interpolateTemplate } from "@repo/utils"
import { useCurrentRoom, useCurrentUser, useIsAdmin, usePluginConfigs } from "../../hooks/useActors"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import {
  ensurePluginComponentActor,
  getPluginComponentActor,
  setPluginComponentRoomId,
} from "../../actors/pluginComponentRegistry"
import {
  PluginComponentContext,
  PluginConfigsContext,
  PluginModalApiContext,
  PluginViewerContext,
} from "./context"
import { PluginComponentRenderer } from "./PluginComponentRenderer"
import type { PluginModalComponent } from "../../types/PluginComponent"

function PluginModalHost({
  pluginName,
  config,
  modals,
  isOpen,
  onClose,
  openModal,
  closeModal,
}: {
  pluginName: string
  config: Record<string, unknown>
  modals: PluginModalComponent[]
  isOpen: (modalId: string) => boolean
  onClose: (modalId: string) => void
  openModal: (modalId: string) => void
  closeModal: (modalId: string) => void
}) {
  const actor = getPluginComponentActor(pluginName)
  const store = useSelector(actor!, (s) => s.context.store)

  const contextValue = useMemo(
    () => ({
      store,
      config,
      openModal,
      closeModal,
      pluginName,
    }),
    [store, config, openModal, closeModal, pluginName],
  )

  if (!actor || modals.length === 0) return null

  return (
    <PluginComponentContext.Provider value={contextValue}>
      {modals.map((modal) => {
        const interpolatedTitle = interpolateTemplate(modal.title, { config })
        return (
          <DialogRoot
            key={modal.id}
            open={isOpen(modal.id)}
            onOpenChange={(e) => !e.open && onClose(modal.id)}
            size={modal.size || "md"}
            placement="center"
          >
            <Portal>
              <DialogBackdrop />
              <DialogPositioner>
                <DialogContent>
                  <DialogHeader>{interpolatedTitle}</DialogHeader>
                  <DialogCloseTrigger asChild position="absolute" top="2" right="2">
                    <CloseButton size="sm" />
                  </DialogCloseTrigger>
                  <DialogBody pb={6}>
                    <VStack align="stretch" gap={4}>
                      {modal.children.map((child) => (
                        <PluginComponentRenderer key={child.id} component={child} />
                      ))}
                    </VStack>
                  </DialogBody>
                </DialogContent>
              </DialogPositioner>
            </Portal>
          </DialogRoot>
        )
      })}
    </PluginComponentContext.Provider>
  )
}

export function PluginComponentsRoomProvider({ children }: { children: ReactNode }) {
  const room = useCurrentRoom()
  const roomId = room?.id
  const { schemas, isLoading } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}
  const currentUser = useCurrentUser()
  const isAdmin = useIsAdmin()
  const [openModals, setOpenModals] = useState<Record<string, Set<string>>>({})

  const viewer = useMemo(
    () => ({ userId: currentUser?.userId, isAdmin }),
    [currentUser?.userId, isAdmin],
  )

  // Ensure shared actors exist as soon as schemas are known (sync during render)
  const pluginsWithComponents = useMemo(() => {
    if (isLoading) return []
    const result: {
      pluginName: string
      config: Record<string, unknown>
      modals: PluginModalComponent[]
    }[] = []

    for (const schema of schemas) {
      if (!schema.componentSchema?.components?.length) continue
      const storeKeys = schema.componentSchema.storeKeys || []
      ensurePluginComponentActor(schema.name, storeKeys)
      const modals = schema.componentSchema.components.filter(
        (c): c is PluginModalComponent => c.type === "modal",
      )
      result.push({
        pluginName: schema.name,
        config: pluginConfigs[schema.name] || schema.defaultConfig || {},
        modals,
      })
    }
    return result
  }, [schemas, isLoading, pluginConfigs])

  const configsByPlugin = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {}
    for (const { pluginName, config } of pluginsWithComponents) {
      map[pluginName] = config
    }
    return map
  }, [pluginsWithComponents])

  useEffect(() => {
    if (!roomId) return
    setPluginComponentRoomId(roomId)
  }, [roomId, pluginsWithComponents])

  const openModal = useCallback((pluginName: string, modalId: string) => {
    setOpenModals((prev) => {
      const current = prev[pluginName] ?? new Set<string>()
      if (current.has(modalId)) return prev
      const next = new Set(current)
      next.add(modalId)
      return { ...prev, [pluginName]: next }
    })
  }, [])

  const closeModal = useCallback((pluginName: string, modalId: string) => {
    setOpenModals((prev) => {
      const current = prev[pluginName]
      if (!current?.has(modalId)) return prev
      const next = new Set(current)
      next.delete(modalId)
      return { ...prev, [pluginName]: next }
    })
  }, [])

  const isModalOpen = useCallback(
    (pluginName: string, modalId: string) => openModals[pluginName]?.has(modalId) ?? false,
    [openModals],
  )

  const modalApi = useMemo(
    () => ({ openModal, closeModal, isModalOpen }),
    [openModal, closeModal, isModalOpen],
  )

  return (
    <PluginViewerContext.Provider value={viewer}>
      <PluginConfigsContext.Provider value={configsByPlugin}>
        <PluginModalApiContext.Provider value={modalApi}>
          {children}
          {pluginsWithComponents.map(({ pluginName, config, modals }) => {
            if (modals.length === 0) return null
            return (
              <PluginModalHost
                key={pluginName}
                pluginName={pluginName}
                config={config}
                modals={modals}
                isOpen={(modalId) => isModalOpen(pluginName, modalId)}
                onClose={(modalId) => closeModal(pluginName, modalId)}
                openModal={(modalId) => openModal(pluginName, modalId)}
                closeModal={(modalId) => closeModal(pluginName, modalId)}
              />
            )
          })}
        </PluginModalApiContext.Provider>
      </PluginConfigsContext.Provider>
    </PluginViewerContext.Provider>
  )
}
