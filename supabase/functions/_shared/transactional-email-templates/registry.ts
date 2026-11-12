/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as bookingConfirmation } from './booking-confirmation.tsx'
import { template as bookingReceipt } from './booking-receipt.tsx'
import { template as headlineBroadcast } from './headline-broadcast.tsx'
import { template as contactConfirmation } from './contact-confirmation.tsx'
import { template as recruitmentConfirmation } from './recruitment-confirmation.tsx'
import { template as newsletterWelcome } from './newsletter-welcome.tsx'
import { template as ownerAlertSubmission } from './owner-alert-submission.tsx'
import { template as inboxReply } from './inbox-reply.tsx'
import { template as refundRequestAlert } from './refund-request-alert.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'booking-confirmation': bookingConfirmation,
  'booking-receipt': bookingReceipt,
  'headline-broadcast': headlineBroadcast,
  'contact-confirmation': contactConfirmation,
  'recruitment-confirmation': recruitmentConfirmation,
  'newsletter-welcome': newsletterWelcome,
  'owner-alert-submission': ownerAlertSubmission,
  'inbox-reply': inboxReply,
  'refund-request-alert': refundRequestAlert,
}
