import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BrandHeader, BrandFooter, BrandSignature, SHOP_NAME } from './_brand.tsx'

const SITE_URL = "https://charliesbarbershop.co"

interface SnapshotBullet {
  text: string
  /** Optional anchor id for deep-linking to the matching article section. */
  anchor?: string | null
}

interface HeadlineBroadcastProps {
  recipientName?: string
  language?: 'es' | 'en'
  title?: string
  excerpt?: string
  category?: string
  authorName?: string
  authorRole?: string
  readingTime?: number
  postUrl?: string
  /** Snapshot bullets, optionally with anchor ids matching article headings. */
  snapshot?: SnapshotBullet[]
  /** Social links — provided by send-headline-broadcast from publication settings. */
  socials?: {
    whatsapp?: string | null
    facebook?: string | null
    instagram?: string | null
    youtube?: string | null
  }
}

const HeadlineBroadcastEmail = ({
  recipientName,
  language = 'es',
  title = '',
  excerpt = '',
  category,
  authorName = 'Charlie Corchado',
  authorRole,
  readingTime,
  postUrl = SITE_URL,
  snapshot = [],
  socials = {},
}: HeadlineBroadcastProps) => {
  const es = language === 'es'

  const greeting = recipientName
    ? (es ? `Hola, ${recipientName}.` : `Hi ${recipientName}.`)
    : (es ? '¡Hola!' : 'Hi there!')

  const intro = es
    ? `Aquí tienes un nuevo titular de ${SHOP_NAME}, pensado para que te lleves algo útil aunque no leas el artículo completo.`
    : `Here's a new headline from ${SHOP_NAME}, designed so you walk away with something useful even if you don't read the full piece.`

  const snapshotTitle = es ? 'Resumen rápido' : 'Snapshot'
  const ctaLabel = es ? 'Leer el artículo completo' : 'Read the full article'
  const closingLine = es
    ? '¿Te sirvió? Responde a este email y dime qué tema quieres que cubra próximamente.'
    : 'Was this useful? Reply to this email and tell me what topic to cover next.'

  const meta = [
    category,
    readingTime ? (es ? `${readingTime} min de lectura` : `${readingTime} min read`) : null,
  ].filter(Boolean).join(' · ')

  const bullets = (snapshot || [])
    .map((b) => ({
      text: typeof b?.text === 'string' ? b.text.trim() : '',
      anchor: b?.anchor || null,
    }))
    .filter((b) => b.text.length > 0)
    .slice(0, 5)

  return (
    <Html lang={language} dir="ltr">
      <Head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" /></Head>
      <Preview>{excerpt || title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />

          <Section style={inner}>
            <Text style={kicker}>{es ? 'Nuevo titular' : 'New headline'}</Text>
            <Heading style={h1}>{title}</Heading>
            {meta && <Text style={metaLine}>{meta}</Text>}

            <Text style={greet}>{greeting}</Text>
            <Text style={text}>{intro}</Text>

            {excerpt && <Text style={excerptStyle}>{excerpt}</Text>}

            {bullets.length > 0 && (
              <Section style={snapshotCard}>
                <Text style={snapshotHeading}>{snapshotTitle}</Text>
                {bullets.map((b, i) => {
                  const href = b.anchor ? `${postUrl}#${b.anchor}` : postUrl
                  return (
                    <Text key={i} style={bulletRow}>
                      <Link href={href} style={bulletLink}>
                        <span style={bulletDot}>•</span>
                        <span style={bulletText}>{b.text}</span>
                      </Link>
                    </Text>
                  )
                })}
              </Section>
            )}

            <Section style={ctaSection}>
              <Button href={postUrl} style={button}>{ctaLabel}</Button>
            </Section>

            <Hr style={hr} />

            <Text style={closing}>{closingLine}</Text>
            <Text style={signoff}>
              {authorName}{authorRole ? `, ${authorRole}` : ''}
            </Text>
          </Section>

          <BrandSignature />
          <BrandFooter />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: HeadlineBroadcastEmail,
  subject: (data: Record<string, any>) =>
    data?.title ? String(data.title) : `Nuevo titular de ${SHOP_NAME}`,
  displayName: 'Headline broadcast',
  previewData: {
    recipientName: 'Carlos',
    language: 'es',
    title: 'Domina Tu Barba: Guía para el Clima de Puerto Rico',
    excerpt: 'Cómo mantener tu barba impecable bajo el sol y la humedad caribeña.',
    category: 'Barba',
    authorName: 'Charlie Corchado',
    authorRole: 'Owner & Master Barber',
    readingTime: 6,
    postUrl: 'https://charliesbarbershop.co/titulares/preview',
    snapshot: [
      { text: 'Lava la barba 2 a 3 veces por semana, no diario, para conservar aceites naturales.', anchor: 'lavado' },
      { text: 'Usa aceite ligero después del baño cuando el folículo aún está abierto.', anchor: 'aceite' },
      { text: 'Peina hacia abajo con cerdas naturales para entrenar la dirección de crecimiento.', anchor: 'peinado' },
      { text: 'Recorte profesional cada 3 a 4 semanas evita puntas abiertas por el salitre.', anchor: 'recorte' },
    ],
    socials: {
      whatsapp: '+17873481281',
      instagram: 'https://instagram.com/charliesbarbershop',
      facebook: 'https://facebook.com/charliesbarbershop',
    },
  },
} satisfies TemplateEntry

// ─── Styles ────────────────────────────────────────────────────────────
const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '24px 0',
}
const container = {
  margin: '0 auto',
  padding: 0,
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  border: '1px solid #ececec',
  borderRadius: '14px',
  overflow: 'hidden',
}

const inner = { padding: '32px 32px 8px' }

const kicker = {
  fontSize: '11px', fontWeight: 700 as const, color: '#0a0a0a',
  textTransform: 'uppercase' as const, letterSpacing: '0.2em',
  margin: '0 0 14px',
}
const h1 = {
  fontSize: '28px', fontWeight: 900 as const, color: '#0a0a0a',
  margin: '0 0 10px', letterSpacing: '-0.02em', lineHeight: '1.18',
}
const metaLine = {
  fontSize: '12px', color: '#71717a',
  textTransform: 'uppercase' as const, letterSpacing: '0.12em',
  margin: '0 0 24px',
}
const greet = { fontSize: '15px', color: '#0a0a0a', margin: '0 0 8px', fontWeight: 600 as const }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.65', margin: '0 0 16px' }
const excerptStyle = {
  fontSize: '17px', color: '#0a0a0a', lineHeight: '1.55',
  margin: '4px 0 24px', fontWeight: 500 as const,
  borderLeft: '3px solid #0a0a0a', paddingLeft: '16px',
}

// Snapshot — neutral surface, black bullets (matches PostSnapshot.tsx)
const snapshotCard = {
  backgroundColor: '#f5f5f5',
  border: '1px solid #ececec',
  borderRadius: '14px',
  padding: '20px 22px',
  margin: '0 0 28px',
}
const snapshotHeading = {
  fontSize: '11px', fontWeight: 700 as const, color: '#0a0a0a',
  textTransform: 'uppercase' as const, letterSpacing: '0.2em',
  margin: '0 0 12px',
}
const bulletRow = { fontSize: '14px', lineHeight: '1.55', margin: '0 0 8px', display: 'block' }
const bulletLink = { color: '#0a0a0a', textDecoration: 'none', display: 'block' }
const bulletDot = { color: '#0a0a0a', fontWeight: 700 as const, marginRight: '10px' }
const bulletText = { color: '#0a0a0a' }

const ctaSection = { textAlign: 'center' as const, margin: '8px 0 28px' }
const button = {
  backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: '15px',
  fontWeight: 600 as const, padding: '14px 30px', borderRadius: '10px',
  textDecoration: 'none', display: 'inline-block',
}

const hr = { borderColor: '#ececec', margin: '0 0 22px' }
const closing = { fontSize: '14px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 14px' }
const signoff = { fontSize: '14px', color: '#0a0a0a', margin: '0 0 8px', fontWeight: 600 as const }

