import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter, BrandSignature, SHOP_NAME } from './_brand.tsx'

interface InboxReplyProps {
  name?: string
  bodyText?: string
  language?: 'es' | 'en'
}

const InboxReplyEmail = ({ name, bodyText, language = 'es' }: InboxReplyProps) => {
  const es = language !== 'en'
  const paragraphs = (bodyText || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  return (
    <Html lang={es ? 'es' : 'en'} dir="ltr">
      <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
      <Preview>{es ? `Respuesta de ${SHOP_NAME}` : `Reply from ${SHOP_NAME}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Container style={inner}>
            <Heading style={h1}>
              {name
                ? (es ? `Hola, ${name}` : `Hi ${name}`)
                : (es ? 'Hola,' : 'Hello,')}
            </Heading>
            {paragraphs.length === 0 ? (
              <Text style={text}>{bodyText || ''}</Text>
            ) : (
              paragraphs.map((p, i) => <Text key={i} style={text}>{p}</Text>)
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
  component: InboxReplyEmail,
  subject: (data: Record<string, any>) => data?.subject || (data?.language === 'en' ? `Reply from ${SHOP_NAME}` : `Respuesta de ${SHOP_NAME}`),
  displayName: 'Inbox reply (manual)',
  previewData: { name: 'Juan', bodyText: 'Gracias por tu mensaje.\n\nClaro que sí, podemos ayudarte.', language: 'es' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 18px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.65', margin: '0 0 14px' }
const footer = { fontSize: '13px', color: '#777', margin: '24px 0 0', lineHeight: '1.6' }
