import { useEffect, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  Spinner,
  Tabs,
  Text,
  AbsoluteCenter,
} from "@chakra-ui/react"
import {
  useCancelNewsletterIssue,
  useNewsletterIssue,
  usePreviewNewsletterIssue,
  useScheduleNewsletterIssue,
  useSendNewsletterIssue,
  useUpdateNewsletterIssue,
} from "../../hooks/useNewsletter"
import { MarkdownEditor } from "../../components/publish/MarkdownEditor"
import { ManagedOverflowContainer } from "../../components/layout/ManagedOverflowContainer"
import { PageContent } from "../../components/layout/PageContent"

export const Route = createFileRoute("/newsletter/$issueId")({
  component: NewsletterComposerPage,
})

function NewsletterComposerPage() {
  const { issueId } = Route.useParams()
  const { data: issue, isLoading } = useNewsletterIssue(issueId)
  const [subject, setSubject] = useState("")
  const [bodyMarkdown, setBodyMarkdown] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("edit")

  const save = useUpdateNewsletterIssue(issueId)
  const send = useSendNewsletterIssue(issueId)
  const schedule = useScheduleNewsletterIssue(issueId)
  const cancel = useCancelNewsletterIssue(issueId)
  const preview = usePreviewNewsletterIssue(issueId)

  useEffect(() => {
    if (!issue) return
    setSubject(issue.subject)
    setBodyMarkdown(issue.bodyMarkdown)
    if (issue.scheduledAt) {
      const d = new Date(issue.scheduledAt)
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      setScheduledAt(local.toISOString().slice(0, 16))
    }
  }, [issue?.id, issue?.subject, issue?.bodyMarkdown, issue?.scheduledAt, issue?.updatedAt])

  async function handleSave() {
    await save.mutateAsync({ subject, bodyMarkdown })
  }

  async function handlePreview() {
    await handleSave()
    const html = await preview.mutateAsync()
    setPreviewHtml(html)
    setActiveTab("preview")
  }

  async function handleSend() {
    await handleSave()
    await send.mutateAsync()
  }

  async function handleSchedule() {
    if (!scheduledAt) return
    await handleSave()
    await schedule.mutateAsync({ scheduledAt: new Date(scheduledAt).toISOString() })
  }

  if (isLoading) {
    return (
      <PageContent>
        <AbsoluteCenter>
          <Spinner />
        </AbsoluteCenter>
      </PageContent>
    )
  }

  if (!issue) {
    return (
      <PageContent>
        <Text>Issue not found.</Text>
        <Link to="/newsletter">Back to newsletter</Link>
      </PageContent>
    )
  }

  const isEditable = issue.status === "draft" || issue.status === "scheduled"
  const isScheduled = issue.status === "scheduled"

  return (
    <ManagedOverflowContainer>
      <Flex direction="column" flex="1" minH={0} minW={0} gap={4}>
        <Box flexShrink={0}>
          <HStack mb={2}>
            <Link to="/newsletter">
              <Button size="sm" variant="ghost">
                Back to list
              </Button>
            </Link>
          </HStack>
          <Heading size="lg" mb={3}>
            Newsletter composer
          </Heading>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            mb={3}
            disabled={!isEditable}
          />
          <HStack gap={2} flexWrap="wrap" mb={3}>
            <Button
              size="sm"
              onClick={handleSave}
              loading={save.isPending}
              disabled={!isEditable}
            >
              Save draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePreview}
              loading={preview.isPending}
            >
              Preview
            </Button>
            <Button
              size="sm"
              colorPalette="blue"
              onClick={handleSend}
              loading={send.isPending}
              disabled={!isEditable}
            >
              Send now
            </Button>
            <Input
              type="datetime-local"
              size="sm"
              maxW="220px"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={!isEditable}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSchedule}
              loading={schedule.isPending}
              disabled={!isEditable || !scheduledAt}
            >
              Schedule
            </Button>
            {isScheduled ? (
              <Button
                size="sm"
                variant="ghost"
                colorPalette="red"
                onClick={() => cancel.mutate()}
                loading={cancel.isPending}
              >
                Cancel schedule
              </Button>
            ) : null}
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            Status: {issue.status}
          </Text>
        </Box>

        <Tabs.Root
          value={activeTab}
          onValueChange={(d) => setActiveTab(d.value)}
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
        >
          <Tabs.List mb={3}>
            <Tabs.Trigger value="edit">Edit</Tabs.Trigger>
            <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="edit" flex="1" minH={0} display="flex" flexDirection="column">
            {isEditable ? (
              <MarkdownEditor value={bodyMarkdown} onChange={setBodyMarkdown} />
            ) : (
              <Box flex="1" overflow="auto" p={4} borderWidth="1px" borderRadius="md">
                <Text whiteSpace="pre-wrap">{bodyMarkdown || "(empty)"}</Text>
              </Box>
            )}
          </Tabs.Content>
          <Tabs.Content value="preview" flex="1" minH={0}>
            <Box
              as="iframe"
              title="Email preview"
              srcDoc={previewHtml ?? "<p>Click Preview to render the email.</p>"}
              w="100%"
              h="100%"
              minH="400px"
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              bg="white"
            />
          </Tabs.Content>
        </Tabs.Root>
      </Flex>
    </ManagedOverflowContainer>
  )
}
