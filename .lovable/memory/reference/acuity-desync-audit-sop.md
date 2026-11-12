---
name: Acuity desync audit SOP
description: Mandatory procedure when a booking exists in Acuity but not in the app (or vice versa)
type: reference
---
Rules: never name a person/platform without direct proof. Acuity `scheduledBy` = shop master API account for app bookings; NOT the human. Label every finding Proven / Likely / Unknown.

1. Identify: client (keep similar names apart), barber calendar, PR date/time, ALL Acuity IDs in that slot. Separate nearby bookings.
2. Timeline (PR time): acuity_webhook_log per ID, appointments row or deleted_appointment_tombstones, sync runs, push/email logs. One line per event.
3. Match pattern:
   - P1 duplicate skipped (`skip_duplicate_active_slot`) then original canceled+hard-deleted → survivor only in Acuity. FIXED: webhook now logs `adopt_skipped_duplicate` and imports survivor.
   - P2 reschedule received but local row not moved/filtered (Jeffrey Rivera). Cause unconfirmed; verify before fixing.
   - P3 many `scheduled` events same client/slot in minutes = paid-draft retry (Ronald). Fixed in commitDraft.
   - P4 stale block / overlap conflict.
   - NEW: escalate; add pattern only after root cause proven.
4. Attribution: query `acuity_operator_log` (user, role, barber, action, acuity_id) for app actions. No row = action did not go through the app (Acuity directly) or predates the log; Acuity does not identify who.
5. Report: what happened, pattern code, confidence, who (only if proven), fix known yes/no, repair suggestion.
