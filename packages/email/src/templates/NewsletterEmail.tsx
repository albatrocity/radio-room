import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { EMAIL_STYLES, buildEmailContentResetCss, buildEmailDarkModeCss } from "../emailStyles"

export type NewsletterEmailProps = {
  subject: string
  bodyHtml: string
  unsubscribeUrl: string
  /** Public CDN URL for the brand mark (PNG). When omitted, only the text title is shown. */
  logoUrl?: string
}

const { colors, fonts, sizes, spacing, lineHeight, layout } = EMAIL_STYLES
const light = colors.light

export function NewsletterEmail({
  subject,
  bodyHtml,
  unsubscribeUrl,
  logoUrl,
}: NewsletterEmailProps) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: buildEmailDarkModeCss() }} />
        <style dangerouslySetInnerHTML={{ __html: buildEmailContentResetCss() }} />
      </Head>
      <Preview>{subject}</Preview>
      <Body className="email-body" style={main}>
        <Container className="email-container" style={container}>
          {logoUrl ? (
            <Img src={logoUrl} width="48" height="52" alt="Listening Room" style={logo} />
          ) : null}
          <Heading className="email-brand-heading" style={brandHeading}>
            Listening Room
          </Heading>
          <Section>
            <div className="email-content" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>
          <Hr className="email-hr" style={hr} />
          <Text className="email-muted" style={footer}>
            You are receiving this because you subscribed to{" "}
            <Link href="https://listeningroom.club">Listening Room</Link> updates.{" "}
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

const logo = {
  display: "block",
  margin: "0 0 12px",
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
