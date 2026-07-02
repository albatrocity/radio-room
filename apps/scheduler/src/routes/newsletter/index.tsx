import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Mail, Plus } from "lucide-react"
import type { NewsletterIssueStatus } from "@repo/types"
import {
  useCreateNewsletterIssue,
  useNewsletterIssues,
  useNewsletterSubscribers,
} from "../../hooks/useNewsletter"
import { PageContent } from "../../components/layout/PageContent"

const STATUS_COLORS: Record<NewsletterIssueStatus, string> = {
  draft: "yellow",
  scheduled: "purple",
  sending: "orange",
  sent: "green",
  canceled: "gray",
  failed: "red",
}

export const Route = createFileRoute("/newsletter/")({
  component: NewsletterListPage,
})

function NewsletterListPage() {
  const navigate = useNavigate()
  const { data: issues = [], isLoading } = useNewsletterIssues()
  const { data: subscribers } = useNewsletterSubscribers()
  const createIssue = useCreateNewsletterIssue()
  const [newSubject, setNewSubject] = useState("")

  async function handleCreate() {
    const subject = newSubject.trim()
    if (!subject) return
    const issue = await createIssue.mutateAsync({ subject })
    setNewSubject("")
    navigate({ to: "/newsletter/$issueId", params: { issueId: issue.id } })
  }

  return (
    <PageContent>
      <HStack justify="space-between" mb={4} flexWrap="wrap" gap={3}>
        <Heading size="lg">Newsletter</Heading>
        <HStack gap={2}>
          <Input
            size="sm"
            placeholder="New issue subject"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            maxW="280px"
          />
          <Button
            colorPalette="blue"
            size="sm"
            onClick={handleCreate}
            loading={createIssue.isPending}
            disabled={!newSubject.trim()}
          >
            <Plus size={16} />
            New draft
          </Button>
        </HStack>
      </HStack>

      {subscribers ? (
        <Text fontSize="sm" color="fg.muted" mb={4}>
          {subscribers.counts.active} active subscribers · {subscribers.counts.pending} pending ·{" "}
          {subscribers.counts.unsubscribed} unsubscribed
        </Text>
      ) : null}

      {isLoading ? (
        <Spinner />
      ) : issues.length === 0 ? (
        <Box py={12} textAlign="center" color="fg.muted">
          <Mail size={32} style={{ margin: "0 auto 12px" }} />
          <Text>No newsletter issues yet.</Text>
        </Box>
      ) : (
        <VStack align="stretch" gap={2}>
          {issues.map((issue) => (
            <Box
              key={issue.id}
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              p={3}
              _hover={{ bg: "bg.subtle" }}
            >
              <HStack justify="space-between" align="start" gap={3}>
                <Box flex="1" minW={0}>
                  <Link to="/newsletter/$issueId" params={{ issueId: issue.id }}>
                    <Text fontWeight="semibold" truncate>
                      {issue.subject || "(untitled)"}
                    </Text>
                  </Link>
                  <Text fontSize="xs" color="fg.muted" mt={1}>
                    Updated {new Date(issue.updatedAt).toLocaleString()}
                    {issue.scheduledAt
                      ? ` · Scheduled ${new Date(issue.scheduledAt).toLocaleString()}`
                      : ""}
                    {issue.sentAt ? ` · Sent ${new Date(issue.sentAt).toLocaleString()}` : ""}
                  </Text>
                </Box>
                <Badge colorPalette={STATUS_COLORS[issue.status]}>{issue.status}</Badge>
              </HStack>
            </Box>
          ))}
        </VStack>
      )}
    </PageContent>
  )
}
