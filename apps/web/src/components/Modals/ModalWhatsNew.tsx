import { useEffect } from "react"
import { Accordion, Span, Text, VStack } from "@chakra-ui/react"
import Modal from "../Modal"
import { WhatsNewMarkdown } from "../WhatsNewMarkdown"
import {
  useIsModalOpen,
  useModalsSend,
  useWhatsNewMonths,
  useWhatsNewSend,
} from "../../hooks/useActors"

export default function ModalWhatsNew() {
  const modalSend = useModalsSend()
  const whatsNewSend = useWhatsNewSend()
  const isOpen = useIsModalOpen("whatsNew")
  const months = useWhatsNewMonths()
  const latestId = months[0]?.id
  const defaultOpen = latestId ? [latestId] : []

  useEffect(() => {
    if (isOpen) {
      whatsNewSend({ type: "MARK_VIEWED" })
    }
  }, [isOpen, whatsNewSend])

  return (
    <Modal
      open={isOpen}
      onClose={() => modalSend({ type: "CLOSE_WHATS_NEW" })}
      heading="Changelog"
      contentProps={{ maxW: "lg" }}
    >
      <VStack align="stretch" gap={3} py={1}>
        {months.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">
            No updates yet.
          </Text>
        ) : (
          <Accordion.Root collapsible multiple defaultValue={defaultOpen}>
            {months.map((month) => (
              <Accordion.Item key={month.id} value={month.id}>
                <Accordion.ItemTrigger>
                  <Span flex="1" fontWeight="semibold" textAlign="start">
                    {month.heading}
                  </Span>
                  <Accordion.ItemIndicator />
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                  <Accordion.ItemBody>
                    <WhatsNewMarkdown content={month.bodyMarkdown} />
                  </Accordion.ItemBody>
                </Accordion.ItemContent>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        )}
      </VStack>
    </Modal>
  )
}
