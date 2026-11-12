import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SHOP_NAME = "Charlie's Barbershop"

interface BookingReceiptProps {
  clientName?: string
  serviceName?: string
  barberName?: string
  appointmentDate?: string
  totalLabel?: string
  paymentMethod?: string
  pointsEarned?: number
  pointsBalance?: number
  tier?: string
}

const BookingReceiptEmail = ({
  clientName,
  serviceName = 'tu cita',
  barberName,
  appointmentDate,
  totalLabel,
  paymentMethod,
  pointsEarned,
  pointsBalance,
  tier,
}: BookingReceiptProps) => (
  <Html lang="es" dir="ltr">
    <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
    <Preview>Recibo de tu cita en {SHOP_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {clientName ? `¡Gracias, ${clientName}!` : '¡Gracias!'}
        </Heading>

        <Text style={text}>
          Tu pago fue recibido. Aquí está tu recibo de {SHOP_NAME}.
        </Text>

        <Section style={card}>
          <Text style={cardLabel}>Servicio</Text>
          <Text style={cardValue}>{serviceName}</Text>

          {barberName && (
            <>
              <Text style={cardLabel}>Barbero</Text>
              <Text style={cardValue}>{barberName}</Text>
            </>
          )}

          {appointmentDate && (
            <>
              <Text style={cardLabel}>Fecha y hora</Text>
              <Text style={cardValue}>{appointmentDate}</Text>
            </>
          )}

          {paymentMethod && (
            <>
              <Text style={cardLabel}>Método de pago</Text>
              <Text style={cardValue}>{paymentMethod}</Text>
            </>
          )}

          {totalLabel && (
            <>
              <Text style={cardLabel}>Total pagado</Text>
              <Text style={cardValueLarge}>{totalLabel}</Text>
            </>
          )}
        </Section>

        {typeof pointsEarned === 'number' && pointsEarned > 0 && (
          <Section style={loyaltyCard}>
            <Text style={loyaltyLabel}>Puntos de lealtad ganados</Text>
            <Text style={loyaltyPoints}>+{pointsEarned} pts</Text>
            {typeof pointsBalance === 'number' && (
              <Text style={loyaltySubtext}>
                Balance total: <strong>{pointsBalance} pts</strong>
                {tier && ` · Nivel ${tier}`}
              </Text>
            )}
          </Section>
        )}

        <Hr style={hr} />

        <Text style={footer}>
          PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627
          <br />
          Martes a Sábado - 9:00 AM - 5:00 PM
        </Text>
        <Text style={footerSmall}>
          {SHOP_NAME} · Renova360™
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingReceiptEmail,
  subject: () => `Recibo de tu cita en ${SHOP_NAME}`,
  displayName: 'Booking receipt',
  previewData: {
    clientName: 'Carlos',
    serviceName: 'Corte clásico',
    barberName: 'Charlie',
    appointmentDate: 'sábado, 20 de abril, 10:30 AM',
    totalLabel: '$30.00',
    paymentMethod: 'Tarjeta •••• 4242',
    pointsEarned: 30,
    pointsBalance: 215,
    tier: 'Plata',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}
const container = {
  margin: '0 auto',
  padding: '32px 24px',
  maxWidth: '560px',
}
const h1 = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#0a0a0a',
  margin: '0 0 16px',
  letterSpacing: '-0.01em',
}
const text = {
  fontSize: '15px',
  color: '#3f3f46',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const card = {
  backgroundColor: '#fafafa',
  border: '1px solid #e4e4e7',
  borderRadius: '12px',
  padding: '20px 22px',
  margin: '0 0 16px',
}
const cardLabel = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#71717a',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: '12px 0 4px',
}
const cardValue = {
  fontSize: '15px',
  color: '#0a0a0a',
  fontWeight: 500,
  margin: '0',
}
const cardValueLarge = {
  fontSize: '20px',
  color: '#0a0a0a',
  fontWeight: 700,
  margin: '0',
}
const loyaltyCard = {
  backgroundColor: '#0a0a0a',
  borderRadius: '12px',
  padding: '20px 22px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
}
const loyaltyLabel = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#a1a1aa',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  margin: '0 0 6px',
}
const loyaltyPoints = {
  fontSize: '28px',
  fontWeight: 700,
  color: '#ffffff',
  margin: '0 0 6px',
  letterSpacing: '-0.02em',
}
const loyaltySubtext = {
  fontSize: '13px',
  color: '#d4d4d8',
  margin: '0',
}
const hr = {
  borderColor: '#e4e4e7',
  margin: '24px 0',
}
const footer = {
  fontSize: '12px',
  color: '#71717a',
  lineHeight: '1.6',
  margin: '0 0 8px',
  textAlign: 'center' as const,
}
const footerSmall = {
  fontSize: '11px',
  color: '#a1a1aa',
  margin: '0',
  textAlign: 'center' as const,
}
