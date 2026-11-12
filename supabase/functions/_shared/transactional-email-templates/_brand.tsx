import * as React from 'npm:react@18.3.1'
import { Section, Text, Img, Row, Column, Link } from 'npm:@react-email/components@0.0.22'

export const SHOP_NAME = "Charlie's Barbershop"
export const SHOP_ADDRESS = "PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627"

/**
 * Shared inline header — mirrors the site's PublicNav logo:
 * "CHARLIE'S" black/heavy + "BARBERSHOP" thin, both on one row,
 * with the brand letter-spacing. Solid black band like the newsletter.
 */
export const BrandHeader = () => (
  <Section style={brandBar}>
    <Text style={brandRow}>
      <span style={brandCharlies}>CHARLIE'S</span>
      <span style={brandSpacer}>&nbsp;</span>
      <span style={brandShop}>BARBERSHOP</span>
    </Text>
  </Section>
)

/**
 * Shared compact footer — address + copyright/Renova360 line.
 */
export const BrandFooter = () => (
  <Section style={footerBar}>
    <Text style={footerLine}>{SHOP_NAME} · {SHOP_ADDRESS}</Text>
    <Text style={footerSmall}>
      © {new Date().getFullYear()} C&O Ventures LLC · Renova360™
    </Text>
  </Section>
)

/**
 * Brand signature block — drop-in farewell for the bottom of any email body
 * (before <BrandFooter/>). Uses the razor mark (light variant on white) in
 * place of a personal photo for consistent brand identity.
 *
 * Usage:
 *   <BrandSignature
 *     closing="Saludos,"
 *     name="Charlie Corchado"
 *     title="Owner & Master Barber"
 *   />
 */
export const SIGNATURE_LOGO_URL =
  'https://zskjtfpiohvsgwvbbxnc.supabase.co/storage/v1/object/public/email-assets/razor-signature.png'

export const SHOP_PHONE = '+1 (787) 348-1281'
// Tap-to-WhatsApp instead of tel: — opens conversation directly
export const SHOP_PHONE_HREF = 'https://wa.me/17873481281'
export const SHOP_WEBSITE = 'charliesbarbershop.co'
export const SHOP_WEBSITE_HREF = 'https://charliesbarbershop.co'

interface BrandSignatureProps {
  closing?: string
  name?: string
  title?: string
}

export const BrandSignature = ({
  closing = 'Saludos,',
  name = 'Charlie Corchado',
  title = 'Owner & Master Barber',
}: BrandSignatureProps = {}) => (
  <Section style={sigWrap}>
    <Text style={sigClosing}>{closing}</Text>
    <Text style={sigName}>{name}</Text>
    <Text style={sigTitle}>{title}</Text>
    <Text style={sigDivider}>&nbsp;</Text>
    <Text style={sigMeta}>
      <Link href={SHOP_PHONE_HREF} style={sigLink}>{SHOP_PHONE}</Link>
      <span style={sigDot}>&nbsp;·&nbsp;</span>
      <Link href={SHOP_WEBSITE_HREF} style={sigLink}>{SHOP_WEBSITE}</Link>
    </Text>
    <Text style={sigAddress}>{SHOP_ADDRESS}</Text>
  </Section>
)

const FONT_STACK = "'Montserrat', system-ui, -apple-system, Helvetica, Arial, sans-serif"

const brandBar = {
  backgroundColor: '#080808',
  padding: '20px 24px',
  textAlign: 'center' as const,
}
const brandRow = {
  margin: 0,
  lineHeight: 1,
  textAlign: 'center' as const,
  fontFamily: FONT_STACK,
}
const brandCharlies = {
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 900 as const,
  letterSpacing: '-0.01em',
  verticalAlign: 'middle' as const,
  fontFamily: FONT_STACK,
}
const brandSpacer = {
  display: 'inline-block',
  width: '7px',
}
const brandShop = {
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 300 as const,
  letterSpacing: '0',
  verticalAlign: 'middle' as const,
  fontFamily: FONT_STACK,
}

const footerBar = { padding: '16px 24px 22px', textAlign: 'center' as const, borderTop: '1px solid #ececec', fontFamily: FONT_STACK }
const footerLine = { fontSize: '11px', color: '#71717a', margin: '0 0 4px', lineHeight: '1.6', fontFamily: FONT_STACK }
const footerSmall = { fontSize: '10px', color: '#a1a1aa', margin: 0, letterSpacing: '0.06em', fontFamily: FONT_STACK }

/* ── Signature styles ── */
const sigWrap = {
  padding: '24px 24px 28px',
  borderTop: '1px solid #ececec',
  fontFamily: FONT_STACK,
}
const sigClosing = {
  fontSize: '13px',
  color: '#52525b',
  margin: '0 0 14px',
  fontFamily: FONT_STACK,
  fontStyle: 'italic' as const,
}
const sigLogoCol = {
  width: '72px',
  verticalAlign: 'top' as const,
  paddingRight: '14px',
}
const sigLogo = {
  display: 'block',
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  border: '1px solid #ececec',
  padding: '8px',
  backgroundColor: '#fafafa',
}
const sigBodyCol = { verticalAlign: 'top' as const }
const sigName = {
  fontSize: '14px',
  fontWeight: 700 as const,
  color: '#0a0a0a',
  margin: '0 0 2px',
  letterSpacing: '-0.005em',
  fontFamily: FONT_STACK,
}
const sigTitle = {
  fontSize: '11px',
  fontWeight: 500 as const,
  color: '#71717a',
  margin: 0,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontFamily: FONT_STACK,
}
const sigDivider = {
  borderTop: '1px solid #ececec',
  margin: '10px 0 8px',
  height: '0',
  lineHeight: '0',
  fontSize: '0',
}
const sigMeta = {
  fontSize: '11px',
  color: '#52525b',
  margin: '0 0 4px',
  fontFamily: FONT_STACK,
}
const sigLink = { color: '#0a0a0a', textDecoration: 'none', fontWeight: 600 as const }
const sigDot = { color: '#d4d4d8' }
const sigAddress = { fontSize: '10px', color: '#a1a1aa', margin: 0, fontFamily: FONT_STACK }
