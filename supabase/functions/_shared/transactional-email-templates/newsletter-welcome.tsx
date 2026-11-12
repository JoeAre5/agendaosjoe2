import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter, BrandSignature, SHOP_NAME } from './_brand.tsx'

interface NewsletterWelcomeProps {
  language?: 'es' | 'en'
}

const NewsletterWelcomeEmail = ({ language = 'es' }: NewsletterWelcomeProps) => {
  const es = language !== 'en'
  return (
    <Html lang={es ? 'es' : 'en'} dir="ltr">
      <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
      <Preview>
        {es ? `Bienvenido al newsletter de ${SHOP_NAME}` : `Welcome to the ${SHOP_NAME} newsletter`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Container style={inner}>
            <Heading style={h1}>
              {es ? '¡Bienvenido!' : 'Welcome!'}
            </Heading>
            <Text style={text}>
              {es
                ? `Te suscribiste al newsletter de ${SHOP_NAME}. Recibirás los nuevos titulares y novedades directamente en tu inbox. Sin spam, solo lo bueno.`
                : `You're subscribed to the ${SHOP_NAME} newsletter. You'll get fresh headlines and updates straight to your inbox. No spam, just the good stuff.`}
            </Text>
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
  component: NewsletterWelcomeEmail,
  subject: (data: Record<string, any>) =>
    data?.language === 'en'
      ? `Welcome to the ${SHOP_NAME} newsletter`
      : `Bienvenido al newsletter de ${SHOP_NAME}`,
  displayName: 'Newsletter welcome',
  previewData: { language: 'es' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 16px', letterSpacing: '-0.01em' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 18px' }
const footer = { fontSize: '13px', color: '#777', margin: '24px 0 0', lineHeight: '1.6' }
