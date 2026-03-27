import { useState, useEffect, useCallback } from "react"
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Table,
  Text,
  VStack,
  Badge,
} from "@chakra-ui/react"
import { LuCopy, LuPlus, LuX } from "react-icons/lu"

interface Invitation {
  id: string
  email: string | null
  status: string
  createdAt: string
  expiresAt: string
  useCount: number
  maxUses: number
}

async function authFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api/auth${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  })
  return res.json()
}

export default function InvitationManager() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchInvitations = useCallback(async () => {
    try {
      const data = await authFetch("/invite-only/list")
      if (data?.items) {
        setInvitations(data.items)
      }
    } catch {
      // Invitations may not be available yet
    }
  }, [])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setInviteUrl(null)

    try {
      const data = await authFetch("/invite-only/create", {
        method: "POST",
        body: JSON.stringify({ email: email || undefined, sendEmail: false }),
      })

      if (data?.inviteUrl || data?.code) {
        const url =
          data.inviteUrl ?? `${window.location.origin}/register?invite=${data.code}`
        setInviteUrl(url)
      }
      setEmail("")
      fetchInvitations()
    } catch {
      // Handle error
    }

    setLoading(false)
  }

  async function handleRevoke(id: string) {
    await authFetch("/invite-only/revoke", {
      method: "POST",
      body: JSON.stringify({ id }),
    })
    fetchInvitations()
  }

  async function handleCopy() {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function statusBadge(invitation: Invitation) {
    const status = invitation.status ?? (invitation.useCount >= invitation.maxUses ? "used" : "pending")
    switch (status) {
      case "pending":
        return <Badge colorPalette="blue">Pending</Badge>
      case "used":
        return <Badge colorPalette="green">Used</Badge>
      case "expired":
        return <Badge colorPalette="gray">Expired</Badge>
      case "revoked":
        return <Badge colorPalette="red">Revoked</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <Box>
      <Heading size="md" mb={4}>
        Invitations
      </Heading>

      <form onSubmit={handleCreate}>
        <HStack mb={4}>
          <Input
            placeholder="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={loading}>
            <LuPlus />
            Invite
          </Button>
        </HStack>
      </form>

      {inviteUrl && (
        <Box p={3} mb={4} borderWidth="1px" borderRadius="md">
          <VStack align="stretch" gap={2}>
            <Text fontWeight="bold" fontSize="sm">
              Invite link created:
            </Text>
            <HStack>
              <Input value={inviteUrl} readOnly size="sm" />
              <Button onClick={handleCopy} size="sm" variant="outline">
                <LuCopy />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </HStack>
          </VStack>
        </Box>
      )}

      {invitations.length > 0 && (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Email</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
              <Table.ColumnHeader>Uses</Table.ColumnHeader>
              <Table.ColumnHeader>Created</Table.ColumnHeader>
              <Table.ColumnHeader></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {invitations.map((inv) => (
              <Table.Row key={inv.id}>
                <Table.Cell>{inv.email ?? "—"}</Table.Cell>
                <Table.Cell>{statusBadge(inv)}</Table.Cell>
                <Table.Cell>
                  {inv.useCount}/{inv.maxUses}
                </Table.Cell>
                <Table.Cell>{new Date(inv.createdAt).toLocaleDateString()}</Table.Cell>
                <Table.Cell>
                  {(inv.status === "pending" || inv.useCount < inv.maxUses) && (
                    <Button size="xs" variant="ghost" onClick={() => handleRevoke(inv.id)}>
                      <LuX />
                      Revoke
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}

      {invitations.length === 0 && (
        <Text color="fg.muted" fontSize="sm">
          No invitations yet. Create one to invite a new admin.
        </Text>
      )}
    </Box>
  )
}
