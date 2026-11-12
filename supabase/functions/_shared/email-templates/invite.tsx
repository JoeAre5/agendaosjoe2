/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  BrandHeader, BrandFooter, BrandSignature, SHOP_NAME,
} from '../transactional-email-templates/_brand.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
    </Head>
    <Preview>Te invitaron a {SHOP_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Container style={inner}>
          <Heading style={h1}>Te invitaron al equipo</Heading>
          <Text style={text}>
            Te invitaron a unirte a <strong>{SHOP_NAME}</strong>. Acepta la invitación y crea tu cuenta para empezar.
          </Text>
          <Button style={button} href={confirmationUrl}>Aceptar invitación</Button>
          <Text style={textEn}>
            You've been invited to join {SHOP_NAME}. Tap the button above to accept and create your account.
          </Text>
          <Text style={footer}>
            Si no esperabas esta invitación, puedes ignorar este correo.
          </Text>
        </Container>
        <BrandSignature />
        <BrandFooter />
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 16px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 20px' }
const textEn = { fontSize: '13px', color: '#71717a', lineHeight: '1.6', margin: '20px 0 0', fontStyle: 'italic' as const }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: '14px', fontWeight: 600 as const, borderRadius: '10px', padding: '13px 22px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0', lineHeight: '1.6' }
