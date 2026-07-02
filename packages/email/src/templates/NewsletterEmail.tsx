import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

export type NewsletterEmailProps = {
  subject: string
  bodyHtml: string
  unsubscribeUrl: string
}

export function NewsletterEmail({ subject, bodyHtml, unsubscribeUrl }: NewsletterEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Listening Room</Heading>
          <Section>
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            You are receiving this because you subscribed to Listening Room updates.{" "}
            <Link href={unsubscribeUrl} style={link}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "24px",
  marginBottom: "64px",
  maxWidth: "600px",
  borderRadius: "8px",
}

const heading = {
  color: "#1a1a1a",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "0 0 16px",
}

const hr = {
  borderColor: "#e6ebf1",
  margin: "24px 0",
}

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "18px",
}

const link = {
  color: "#556cd6",
}
