import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter, BrandSignature, SHOP_NAME } from './_brand.tsx'

interface ContactConfirmationProps {
  name?: string
  message?: string
  language?: 'es' | 'en'
}

const ContactConfirmationEmail = ({ name, message, language = 'es' }: ContactConfirmationProps) => {
  const es = language !== 'en'
  return (
    <Html lang={es ? 'es' : 'en'} dir="ltr">
      <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
      <Preview>
        {es ? `Recibimos tu mensaje en ${SHOP_NAME}` : `We received your message at ${SHOP_NAME}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Container style={inner}>
            <Heading style={h1}>
              {name
                ? (es ? `¡Gracias, ${name}!` : `Thanks, ${name}!`)
                : (es ? '¡Gracias por escribirnos!' : 'Thanks for reaching out!')}
            </Heading>
            <Text style={text}>
              {es
                ? `Recibimos tu mensaje en ${SHOP_NAME} y te responderemos lo antes posible, usualmente el mismo día.`
                : `We received your message at ${SHOP_NAME} and will reply as soon as possible, usually the same day.`}
            </Text>
            {message && (
              <Section style={card}>
                <Text style={cardLabel}>{es ? 'Tu mensaje' : 'Your message'}</Text>
                <Text style={cardValue}>{message}</Text>
              </Section>
            )}
            <Text style={footer}>
              {es ? 'Saludos,' : 'Best,'}<br />
              Charlie Corchado<br />
              {SHOP_NAME} · Camuy, PR
            </Text>
          </Container>
          <BrandSignature />
          <BrandFooter />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContactConfirmationEmail,
  subject: (data: Record<string, any>) =>
    data?.language === 'en'
      ? `We received your message at ${SHOP_NAME}`
      : `Recibimos tu mensaje en ${SHOP_NAME}`,
  displayName: 'Contact form confirmation',
  previewData: { name: 'Juan', message: 'Hola, tengo una pregunta sobre los servicios.', language: 'es' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 18px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.65', margin: '0 0 18px' }
const card = { background: '#f6f3ee', borderRadius: '12px', padding: '16px 18px', margin: '20px 0' }
const cardLabel = { fontSize: '11px', color: '#9a9a9a', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: 'bold' as const }
const cardValue = { fontSize: '14px', color: '#1a1a1a', margin: '0 0 12px', whiteSpace: 'pre-wrap' as const }
const footer = { fontSize: '13px', color: '#777', margin: '24px 0 0', lineHeight: '1.6' }
