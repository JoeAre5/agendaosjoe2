/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  BrandHeader, BrandFooter, BrandSignature, SHOP_NAME,
} from '../transactional-email-templates/_brand.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
    </Head>
    <Preview>Tu enlace de acceso a {SHOP_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Container style={inner}>
          <Heading style={h1}>Tu enlace de acceso</Heading>
          <Text style={text}>
            Haz clic en el botón para iniciar sesión en {SHOP_NAME}. Este enlace expira en breve.
          </Text>
          <Button style={button} href={confirmationUrl}>Iniciar sesión</Button>
          <Text style={textEn}>
            Tap the button above to sign in to {SHOP_NAME}. This link expires shortly.
          </Text>
          <Text style={footer}>
            Si no solicitaste este enlace, puedes ignorar este correo.
          </Text>
        </Container>
        <BrandSignature />
        <BrandFooter />
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 16px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 20px' }
const textEn = { fontSize: '13px', color: '#71717a', lineHeight: '1.6', margin: '20px 0 0', fontStyle: 'italic' as const }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: '14px', fontWeight: 600 as const, borderRadius: '10px', padding: '13px 22px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0', lineHeight: '1.6' }
