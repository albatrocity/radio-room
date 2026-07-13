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
import {
  EMAIL_STYLES,
  buildEmailContentResetCss,
  buildEmailDarkModeCss,
} from "../emailStyles"

export type NewsletterEmailProps = {
  subject: string
  bodyHtml: string
  unsubscribeUrl: string
}

const { colors, fonts, sizes, spacing, lineHeight, layout } = EMAIL_STYLES
const light = colors.light

export function NewsletterEmail({ subject, bodyHtml, unsubscribeUrl }: NewsletterEmailProps) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style
          dangerouslySetInnerHTML={{ __html: buildEmailDarkModeCss() }}
        />
        <style
          dangerouslySetInnerHTML={{ __html: buildEmailContentResetCss() }}
        />
      </Head>
      <Preview>{subject}</Preview>
      <Body className="email-body" style={main}>
        <Container className="email-container" style={container}>
          <Heading className="email-brand-heading" style={brandHeading}>
            Listening Room
          </Heading>
          <Section>
            <div
              className="email-content"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </Section>
          <Hr className="email-hr" style={hr} />
          <Text className="email-muted" style={footer}>
            You are receiving this because you subscribed to Listening Room updates.{" "}
            <Link href={unsubscribeUrl} className="email-link" style={linkStyle}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: light.containerBg,
  fontFamily: fonts.base,
  margin: 0,
  padding: 0,
}

const container = {
  backgroundColor: light.bg,
  margin: "0 auto",
  padding: spacing.containerPadding,
  marginBottom: spacing.containerBottom,
  maxWidth: layout.maxWidth,
  borderRadius: layout.borderRadius,
}

const brandHeading = {
  color: light.heading,
  fontSize: sizes.brandHeading,
  fontWeight: "600" as const,
  margin: spacing.brandHeadingMargin,
}

const hr = {
  borderColor: light.hr,
  margin: spacing.hrMargin,
}

const footer = {
  color: light.muted,
  fontSize: sizes.footer,
  lineHeight: lineHeight.footer,
}

const linkStyle = {
  color: light.link,
}
