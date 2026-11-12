import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter } from './_brand.tsx'

interface RefundAlertProps {
  source?: 'refund' | 'dispute'
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  amountUsd?: string
  serviceName?: string
  appointmentDate?: string
  reason?: string
  stripeChargeUrl?: string
  stripeDisputeUrl?: string
  adminUrl?: string
  whatsappUrl?: string
  telUrl?: string
  mailtoUrl?: string
  evidenceDueBy?: string
}

const RefundAlertEmail = ({
  source = 'refund',
  clientName = 'Cliente',
  clientPhone,
  clientEmail,
  amountUsd = '0.00',
  serviceName,
  appointmentDate,
  reason,
  stripeChargeUrl,
  stripeDisputeUrl,
  adminUrl,
  whatsappUrl,
  telUrl,
  mailtoUrl,
  evidenceDueBy,
}: RefundAlertProps) => {
  const isDispute = source === 'dispute'
  const heading = isDispute
    ? 'Disputa de cargo iniciada'
    : 'Reembolso solicitado'
  const intro = isDispute
    ? `${clientName} disputó un cargo de $${amountUsd} con su banco. Tienes una ventana limitada para responder antes de que se complete.`
    : `Se inició un reembolso de $${amountUsd} para ${clientName}. Confírmalo antes de que los fondos salgan de tu cuenta.`

  return (
    <Html lang="es" dir="ltr">
      <Head>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
      </Head>
      <Preview>{heading}: {clientName}, ${amountUsd}</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Container style={inner}>
            <Section style={alertStrip}>
              <Text style={alertStripText}>{isDispute ? 'DISPUTA / CHARGEBACK' : 'REEMBOLSO'}</Text>
            </Section>

            <Heading style={h1}>{heading}</Heading>
            <Text style={text}>{intro}</Text>

            <Section style={card}>
              <Text style={cardLabel}>Cliente</Text>
              <Text style={cardValue}>{clientName}</Text>

              {clientPhone && (
                <>
                  <Text style={cardLabel}>Teléfono</Text>
                  <Text style={cardValue}>{clientPhone}</Text>
                </>
              )}
              {clientEmail && (
                <>
                  <Text style={cardLabel}>Email</Text>
                  <Text style={cardValue}>{clientEmail}</Text>
                </>
              )}
              {serviceName && (
                <>
                  <Text style={cardLabel}>Servicio</Text>
                  <Text style={cardValue}>{serviceName}</Text>
                </>
              )}
              {appointmentDate && (
                <>
                  <Text style={cardLabel}>Fecha de la cita</Text>
                  <Text style={cardValue}>{appointmentDate}</Text>
                </>
              )}
              <Text style={cardLabel}>Monto</Text>
              <Text style={cardValue}>${amountUsd}</Text>
              {reason && (
                <>
                  <Text style={cardLabel}>Razón reportada</Text>
                  <Text style={cardValue}>{reason}</Text>
                </>
              )}
              {evidenceDueBy && (
                <>
                  <Text style={cardLabel}>Fecha límite para evidencia</Text>
                  <Text style={{ ...cardValue, color: '#b91c1c', fontWeight: 'bold' as const }}>{evidenceDueBy}</Text>
                </>
              )}
            </Section>

            <Section style={{ margin: '20px 0' }}>
              {telUrl && <Link href={telUrl} style={btnPrimary}>Llamar al cliente</Link>}
              {whatsappUrl && <Link href={whatsappUrl} style={btnSecondary}>WhatsApp</Link>}
              {mailtoUrl && <Link href={mailtoUrl} style={btnSecondary}>Enviar email</Link>}
            </Section>

            <Section style={{ margin: '20px 0' }}>
              {(stripeDisputeUrl || stripeChargeUrl) && (
                <Link href={stripeDisputeUrl || stripeChargeUrl!} style={btnDark}>Abrir en Stripe</Link>
              )}
              {adminUrl && <Link href={adminUrl} style={btnDark}>Ver en AgendaOS</Link>}
            </Section>

            <Text style={footnote}>
              Esta alerta se generó automáticamente cuando Stripe reportó la actividad. Ningún reembolso se procesa
              automáticamente. Contacta al cliente y resuelve en Stripe manualmente.
            </Text>
          </Container>
          <BrandFooter />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RefundAlertEmail,
  subject: (data: Record<string, any>) => {
    const isDispute = data?.source === 'dispute'
    const label = isDispute ? 'Disputa de cargo' : 'Reembolso solicitado'
    const tail = data?.clientName ? `, ${data.clientName}` : ''
    const amt = data?.amountUsd ? ` ($${data.amountUsd})` : ''
    return `${label}${tail}${amt}`
  },
  displayName: 'Alerta: reembolso o disputa',
  previewData: {
    source: 'refund',
    clientName: 'Juan Pérez',
    clientPhone: '787-555-1234',
    clientEmail: 'juan@example.com',
    amountUsd: '45.00',
    serviceName: 'Corte de cabello',
    appointmentDate: 'sáb, 18 may, 2:30 PM',
    reason: 'requested_by_customer',
    stripeChargeUrl: 'https://dashboard.stripe.com/payments/pi_example',
    adminUrl: 'https://charliesbarbershop.co/admin/sales?status=pending_review',
    whatsappUrl: 'https://wa.me/17875551234',
    telUrl: 'tel:+17875551234',
    mailtoUrl: 'mailto:juan@example.com',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: '24px 0' }
const container = { margin: '0 auto', maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #ececec' }
const inner = { padding: '28px 28px 24px' }
const alertStrip = { background: '#fef2f2', borderRadius: '8px', padding: '8px 14px', margin: '0 0 16px', border: '1px solid #fecaca' }
const alertStripText = { fontSize: '11px', color: '#b91c1c', margin: 0, fontWeight: 'bold' as const, letterSpacing: '1px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 12px', letterSpacing: '-0.01em' }
const text = { fontSize: '14px', color: '#3a3a3a', lineHeight: '1.6', margin: '0 0 16px' }
const card = { background: '#f6f3ee', borderRadius: '12px', padding: '14px 18px', margin: '16px 0' }
const cardLabel = { fontSize: '11px', color: '#9a9a9a', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: 'bold' as const }
const cardValue = { fontSize: '14px', color: '#1a1a1a', margin: '0 0 12px', whiteSpace: 'pre-wrap' as const }
const btnPrimary = { display: 'inline-block', background: '#b91c1c', color: '#ffffff', padding: '12px 22px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px', marginRight: '8px', marginBottom: '8px' }
const btnSecondary = { display: 'inline-block', background: '#f6f3ee', color: '#1a1a1a', padding: '12px 22px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px', marginRight: '8px', marginBottom: '8px' }
const btnDark = { display: 'inline-block', background: '#0a0a0a', color: '#ffffff', padding: '12px 22px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px', marginRight: '8px', marginBottom: '8px' }
const footnote = { fontSize: '12px', color: '#888', margin: '24px 0 0', lineHeight: '1.5' }
