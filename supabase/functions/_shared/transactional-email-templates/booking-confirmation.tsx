import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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

interface BookingConfirmationProps {
  clientName?: string
  serviceName?: string
  barberName?: string
  appointmentDate?: string // human-formatted, AST: "sábado, 20 de abril, 10:30 AM"
  totalLabel?: string // e.g. "$30.00" or "Pago al llegar"
  payUrl?: string
  isPaid?: boolean
}

const BookingConfirmationEmail = ({
  clientName,
  serviceName = 'tu cita',
  barberName,
  appointmentDate,
  totalLabel,
  payUrl,
  isPaid = false,
}: BookingConfirmationProps) => (
  <Html lang="es" dir="ltr">
    <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
    <Preview>
      {isPaid
        ? `Tu cita en ${SHOP_NAME} está confirmada`
        : `Confirma tu cita en ${SHOP_NAME} con tu pago`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {clientName ? `¡Hola, ${clientName}!` : '¡Hola!'}
        </Heading>

        <Text style={text}>
          {isPaid
            ? `Tu cita en ${SHOP_NAME} está confirmada. Aquí están los detalles:`
            : `Reservamos tu cita en ${SHOP_NAME}. Para asegurar tu turno, completa tu pago abajo.`}
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

          {totalLabel && (
            <>
              <Text style={cardLabel}>Total</Text>
              <Text style={cardValue}>{totalLabel}</Text>
            </>
          )}
        </Section>

        {!isPaid && payUrl && (
          <Section style={ctaSection}>
            <Button href={payUrl} style={button}>
              Completar pago
            </Button>
            <Text style={smallText}>
              Si no pagas dentro del tiempo permitido, tu cita podría ser cancelada
              automáticamente.
            </Text>
          </Section>
        )}

        {payUrl && (
          <Text style={smallText}>
            ¿Aún no tienes cuenta? Desde el enlace de tu reserva puedes crear una
            contraseña para manejar tus citas y ver tu historial.
          </Text>
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
  component: BookingConfirmationEmail,
  subject: (data: Record<string, any>) =>
    data?.isPaid
      ? `Cita confirmada en ${SHOP_NAME}`
      : `Completa tu reserva en ${SHOP_NAME}`,
  displayName: 'Booking confirmation',
  previewData: {
    clientName: 'Carlos',
    serviceName: 'Corte clásico',
    barberName: 'Charlie',
    appointmentDate: 'sábado, 20 de abril, 10:30 AM',
    totalLabel: '$30.00',
    payUrl: 'https://charliesbarbershop.co/pay/preview-token',
    isPaid: false,
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
  margin: '0 0 24px',
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
const ctaSection = {
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
const button = {
  backgroundColor: '#0a0a0a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  padding: '14px 28px',
  borderRadius: '10px',
  textDecoration: 'none',
  display: 'inline-block',
}
const smallText = {
  fontSize: '12px',
  color: '#71717a',
  margin: '14px 0 0',
  lineHeight: '1.5',
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
