import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter } from './_brand.tsx'

interface OwnerAlertProps {
  formType?: 'contact' | 'recruitment'
  submitterName?: string
  submitterEmail?: string
  submitterPhone?: string
  isExistingClient?: boolean
  message?: string
  details?: Array<{ label: string; value: string }>
  inboxUrl?: string
}

// formType → masculine/feminine-correct heading + subject fragment
const FORM_LABELS: Record<'contact' | 'recruitment', { heading: string; gender: 'm' | 'f' }> = {
  contact:     { heading: 'mensaje de contacto',          gender: 'm' },
  recruitment: { heading: 'solicitud para unirse al equipo', gender: 'f' },
}

const OwnerAlertEmail = ({
  formType = 'contact',
  submitterName,
  submitterEmail,
  submitterPhone,
  isExistingClient,
  message,
  details = [],
  inboxUrl,
}: OwnerAlertProps) => {
  const meta = FORM_LABELS[formType] ?? FORM_LABELS.contact
  const nuevo = meta.gender === 'f' ? 'Nueva' : 'Nuevo'
  const headingText = `${nuevo} ${meta.heading}`
  return (
    <Html lang="es" dir="ltr">
      <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
      <Preview>
        {headingText}{submitterName ? ` de ${submitterName}` : ''}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Container style={inner}>
            <Heading style={h1}>{headingText}</Heading>
            <Text style={text}>
              {isExistingClient
                ? `De un cliente existente${submitterName ? `: ${submitterName}` : ''}.`
                : `De un prospecto nuevo${submitterName ? `: ${submitterName}` : ''}.`}
            </Text>

            <Section style={card}>
              {submitterName && (
                <>
                  <Text style={cardLabel}>Nombre</Text>
                  <Text style={cardValue}>{submitterName}</Text>
                </>
              )}
              {submitterEmail && (
                <>
                  <Text style={cardLabel}>Email</Text>
                  <Text style={cardValue}>{submitterEmail}</Text>
                </>
              )}
              {submitterPhone && (
                <>
                  <Text style={cardLabel}>Teléfono</Text>
                  <Text style={cardValue}>{submitterPhone}</Text>
                </>
              )}
              {details.map((d) => (
                <React.Fragment key={d.label}>
                  <Text style={cardLabel}>{d.label}</Text>
                  <Text style={cardValue}>{d.value}</Text>
                </React.Fragment>
              ))}
              {message && (
                <>
                  <Text style={cardLabel}>Mensaje</Text>
                  <Text style={cardValue}>{message}</Text>
                </>
              )}
            </Section>

            {inboxUrl && (
              <Text style={text}>
                <Link href={inboxUrl} style={btn}>Abrir bandeja en AgendaOS</Link>
              </Text>
            )}
          </Container>
          <BrandFooter />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OwnerAlertEmail,
  subject: (data: Record<string, any>) => {
    const ft = data?.formType === 'recruitment' ? 'recruitment' : 'contact'
    const meta = FORM_LABELS[ft]
    const nuevo = meta.gender === 'f' ? 'Nueva' : 'Nuevo'
    const tail = data?.submitterName ? ` — ${data.submitterName}` : ''
    return `${nuevo} ${meta.heading}${tail}`
  },
  displayName: 'Owner alert: form submission',
  previewData: {
    formType: 'recruitment',
    submitterName: 'Isabella Rivera',
    submitterEmail: 'isabella@example.com',
    submitterPhone: '787-555-1234',
    isExistingClient: false,
    message: 'Me encantaría conocer más sobre el equipo.',
    inboxUrl: 'https://charliesbarbershop.co/admin/bandeja',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 12px', letterSpacing: '-0.01em' }
const text = { fontSize: '14px', color: '#3a3a3a', lineHeight: '1.6', margin: '0 0 16px' }
const card = { background: '#f6f3ee', borderRadius: '12px', padding: '14px 18px', margin: '16px 0' }
const cardLabel = { fontSize: '11px', color: '#9a9a9a', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: 'bold' as const }
const cardValue = { fontSize: '14px', color: '#1a1a1a', margin: '0 0 12px', whiteSpace: 'pre-wrap' as const }
const btn = { display: 'inline-block', background: '#0a0a0a', color: '#ffffff', padding: '12px 22px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px' }
