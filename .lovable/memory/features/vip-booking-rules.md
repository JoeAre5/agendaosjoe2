---
name: VIP Booking Rules
description: Service-scoped booking rules override global min_advance_minutes. VIP services use 480min (8hr) advance. Applied in all flows via useBookingRules hook.
type: feature
---
Service-scoped booking rules in the `booking_rules` table (scope='service') override the global `min_advance_minutes` for specific services.

VIP Rule: VIP services require 8 hours (480 minutes) advance booking, overriding the global rule.

The `useBookingRules` hook (`src/hooks/useBookingRules.ts`) centralizes rule resolution:
- Fetches all active global + service-scoped rules
- Maps `booking_rules.service_id` → `services.acuity_type_id` for Acuity matching
- `getMinAdvance(acuityTypeId)` returns effective min_advance_minutes

Applied in all booking flows:
- ClientNewAppointment (client new booking)
- ClientReschedule (client reschedule)
- NewAppointment (admin/barber new booking)
- EditAppointment (admin/barber edit)

Admin configures via BookingRules page (/admin/booking-rules) under "Por Servicio" section. VIP services show a 👑 badge.
