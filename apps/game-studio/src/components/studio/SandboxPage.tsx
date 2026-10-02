"use client"

import { Center, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { STUDIO_PREVIEW_VIEW_AS_USER_KEY } from "../../studio/constants"
import type { StudioBootstrap } from "../../studio/studioBootstrap"
import { AddItemDrawer } from "./AddItemDrawer"
import { BottomPanels } from "./BottomPanels"
import { GlobalToolbar } from "./GlobalToolbar"
import { UserCard } from "./UserCard"
import { toaster } from "../ui/toaster"
import { useNowTick } from "../../hooks/useNowTick"
import { useStudioRoom } from "../../hooks/useStudioRoom"
import * as studioActions from "../../studio/studioActions"

export function SandboxPage({ boot }: { boot: StudioBootstrap | null }) {
  const room = useStudioRoom(boot?.room ?? null)
  const now = useNowTick()
  const [newUsername, setNewUsername] = useState("Guest")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [previewViewAsUserId, setPreviewViewAsUserId] = useState<string | null>(() => {
    if (typeof sessionStorage === "undefined") return null
    return sessionStorage.getItem(STUDIO_PREVIEW_VIEW_AS_USER_KEY)
  })

  useEffect(() => {
    if (!room) return
    if (previewViewAsUserId != null && !room.users.has(previewViewAsUserId)) {
      setPreviewViewAsUserId(null)
      sessionStorage.removeItem(STUDIO_PREVIEW_VIEW_AS_USER_KEY)
    }
  }, [previewViewAsUserId, room?.snapshotEpoch, room])

  if (!boot || !room) {
    return (
      <Center minH="50dvh">
        <Spinner size="lg" />
      </Center>
    )
  }

  const users = [...room.users.keys()]

  return (
    <Stack gap="6">
      <GlobalToolbar
        room={room}
        newUsername={newUsername}
        setNewUsername={setNewUsername}
        onAddUser={() => {
          studioActions.addStudioUser(newUsername.trim() || "Guest")
          setNewUsername("Guest")
        }}
        onStartGame={() =>
          void (async () => {
            try {
              await studioActions.startStudioGameSession()
              toaster.create({ title: "Game session started", type: "success" })
            } catch (e) {
              toaster.create({
                title: "Could not start session",
                description: String(e),
                type: "error",
              })
            }
          })()
        }
        onEndGame={() =>
          void (async () => {
            try {
              await studioActions.endStudioGameSession()
              toaster.create({ title: "Game session ended", type: "success" })
            } catch (e) {
              toaster.create({
                title: "Could not end session",
                description: String(e),
                type: "error",
              })
            }
          })()
        }
        onStartShopping={() =>
          void (async () => {
            try {
              const res = await studioActions.startShoppingSession()
              toaster.create({
                title: res.success ? "Shopping round started" : "Shopping failed",
                description: res.message,
                type: res.success ? "success" : "error",
              })
            } catch (e) {
              toaster.create({
                title: "Shopping failed",
                description: String(e),
                type: "error",
              })
            }
          })()
        }
        onEndShopping={() =>
          void (async () => {
            const res = await studioActions.endShoppingSession()
            toaster.create({
              title: res.success ? "Shopping ended" : "Could not end shopping",
              description: res.message,
              type: res.success ? "success" : "error",
            })
          })()
        }
        onOpenItemDrawer={() => setDrawerOpen(true)}
        onFireAllTimers={() => {
          const { fired } = studioActions.fireAllPluginTimers()
          toaster.create({
            title: fired === 0 ? "No pending timers" : `Fired ${fired} timer(s)`,
            type: fired === 0 ? "info" : "success",
          })
        }}
        onResetSandbox={() => {
          if (
            window.confirm(
              "Reset Game Studio? This clears saved sandbox state and reloads the page. :)",
            )
          ) {
            studioActions.resetStudioSandbox()
          }
        }}
      />

      {users.length === 0 ? (
        <Text color="fg.muted">
          No players yet — add a user, start a game session, then exercise items.
        </Text>
      ) : (
        <SimpleGrid gap="4" columns={{ base: 1, md: 2, xl: 3 }}>
          {users.map((uid) => (
            <UserCard
              key={uid}
              room={room}
              userId={uid}
              now={now}
              previewViewAsUserId={previewViewAsUserId}
              onPreviewViewAsApplied={(appliedUserId) => {
                setPreviewViewAsUserId(appliedUserId)
                sessionStorage.setItem(STUDIO_PREVIEW_VIEW_AS_USER_KEY, appliedUserId)
              }}
            />
          ))}
        </SimpleGrid>
      )}

      <BottomPanels room={room} />

      <AddItemDrawer room={room} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </Stack>
  )
}
