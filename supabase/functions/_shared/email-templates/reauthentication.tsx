/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  BrandHeader, BrandFooter, BrandSignature, SHOP_NAME,
} from '../transactional-email-templates/_brand.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
    </Head>
    <Preview>Tu código de verificación de {SHOP_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Container style={inner}>
          <Heading style={h1}>Código de verificación</Heading>
          <Text style={text}>Usa el siguiente código para confirmar tu identidad en {SHOP_NAME}:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Text style={textEn}>
            Use the code above to confirm your identity. It expires shortly.
          </Text>
          <Text style={footer}>
            Si no solicitaste este código, puedes ignorar este correo.
          </Text>
        </Container>
        <BrandSignature />
        <BrandFooter />
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 16px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 16px' }
const textEn = { fontSize: '13px', color: '#71717a', lineHeight: '1.6', margin: '20px 0 0', fontStyle: 'italic' as const }
const codeStyle = { fontFamily: "'Courier New', Courier, monospace", fontSize: '32px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 24px', letterSpacing: '0.2em', textAlign: 'center' as const, backgroundColor: '#fafafa', padding: '18px', borderRadius: '10px', border: '1px solid #ececec' }
const footer = { fontSize: '12px', color: '#a1a1aa', margin: '24px 0 0', lineHeight: '1.6' }
