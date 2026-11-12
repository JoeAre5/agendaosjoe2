import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter, BrandSignature, SHOP_NAME } from './_brand.tsx'

interface RecruitmentConfirmationProps {
  name?: string
  language?: 'es' | 'en'
}

const RecruitmentConfirmationEmail = ({ name, language = 'es' }: RecruitmentConfirmationProps) => {
  const es = language !== 'en'
  return (
    <Html lang={es ? 'es' : 'en'} dir="ltr">
      <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
      <Preview>
        {es ? `Recibimos tu solicitud para unirte a ${SHOP_NAME}` : `We received your application to join ${SHOP_NAME}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Container style={inner}>
            <Heading style={h1}>
              {name
                ? (es ? `¡Gracias, ${name}!` : `Thanks, ${name}!`)
                : (es ? '¡Gracias por tu interés!' : 'Thanks for your interest!')}
            </Heading>
            <Text style={text}>
              {es
                ? `Recibimos tu solicitud para unirte al equipo de ${SHOP_NAME}. Charlie revisa cada aplicación personalmente y te contactará pronto si hay match.`
                : `We received your application to join the ${SHOP_NAME} team. Charlie reviews each one personally and will reach out soon if there's a fit.`}
            </Text>
            <Text style={text}>
              {es
                ? 'Mientras tanto, si quieres conocernos mejor, pasa por la barbería en Camuy.'
                : 'In the meantime, feel free to stop by the shop in Camuy to get to know us.'}
            </Text>
            <Text style={footer}>
              {es ? 'Saludos,' : 'Best,'}<br />
              Charlie Corchado<br />
              {SHOP_NAME}
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
  component: RecruitmentConfirmationEmail,
  subject: (data: Record<string, any>) =>
    data?.language === 'en'
      ? `We received your application to join ${SHOP_NAME}`
      : `Recibimos tu solicitud para unirte a ${SHOP_NAME}`,
  displayName: 'Join the team confirmation',
  previewData: { name: 'María', language: 'es' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.65', margin: '0 0 18px' }
const footer = { fontSize: '13px', color: '#777', margin: '24px 0 0', lineHeight: '1.6' }
