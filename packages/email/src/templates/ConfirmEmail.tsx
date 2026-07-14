import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

export type ConfirmEmailProps = {
  confirmUrl: string
  /** Public CDN URL for the brand mark (PNG). When omitted, only the heading is shown. */
  logoUrl?: string
}

export function ConfirmEmail({ confirmUrl, logoUrl }: ConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your Listening Room newsletter subscription</Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl ? (
            <Img src={logoUrl} width="48" height="52" alt="Listening Room" style={logo} />
          ) : null}
          <Heading style={heading}>Confirm your subscription</Heading>
          <Text style={text}>
            Thanks for signing up for Listening Room updates. Click the button below to confirm your
            email address.
          </Text>
          <Section style={buttonSection}>
            <Button href={confirmUrl} style={button}>
              Confirm subscription
            </Button>
          </Section>
          <Text style={muted}>
            If you did not request this, you can safely ignore this email.
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

const logo = {
  display: "block",
  margin: "0 0 12px",
}

const heading = {
  color: "#1a1a1a",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "0 0 16px",
}

const text = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
}

const buttonSection = {
  margin: "24px 0",
}

const button = {
  backgroundColor: "#556cd6",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
}

const muted = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "18px",
}
