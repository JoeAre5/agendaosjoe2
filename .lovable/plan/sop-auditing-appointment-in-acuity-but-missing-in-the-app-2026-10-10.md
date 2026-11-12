# SOP: Auditing "appointment in Acuity but missing in the app"

## Goal
A fixed checklist I follow every time a booking shows in Acuity but not in AgendaOS (like Jeffrey Rivera and Esteban Alvarez). It keeps me from guessing who did it, and it tells me fast whether this is a problem we have already seen.

## The SOP (saved as a permanent project rule)

**Step 0: Rules before starting**
- Never name a person or platform without direct proof.
- Acuity's `scheduledBy` = the shop's master API account for anything made in AgendaOS. It does NOT name the person.
- Label every finding as Proven, Likely, or Unknown.

**Step 1: Identify the booking**
- Client name (keep similar names apart, e.g. Carlitos vs Carlos), barber calendar, date/time, every Acuity ID in that slot.
- Kept separate from nearby bookings in the same slot (e.g. Adamariz).

**Step 2: Build the timeline (PR time)**
Pull, in order: Acuity webhook log entries for each ID, the app appointment row or deletion record, sync runs, push/email logs. One line per event: time, ID, event, what the app did, source.

**Step 3: Match against known patterns**
| Code | Pattern | Signature |
|---|---|---|
| P1 | Duplicate skipped, then original canceled | 2 IDs same slot; 2nd skipped as `skip_duplicate_active_slot`; 1st later canceled and deleted; 2nd lives only in Acuity (Esteban) |
| P2 | Reschedule not reflected | `appointment.rescheduled` received but the local row did not move or was filtered out (Jeffrey) |
| P3 | Paid-draft retry duplicates | many `scheduled` events for the same client/slot within minutes (Ronald) |
| P4 | Stale block / overlap conflict | create rejected because of an old block |
| NEW | Matches none | escalate, add a new pattern after root cause is proven |

**Step 4: Who did it (attribution)**
- App path: check the operator audit log (see below). Without it, say "Unknown" and only narrow it down by permissions.
- Acuity directly: say that Acuity does not tell us who did it.

**Step 5: Report format (short)**
What happened, Pattern code, Proven/Likely/Unknown, who (only if proven), fix already known? yes/no, suggested repair (e.g. bring the surviving Acuity booking into the app).

## Supporting changes (built after approval)
1. **Operator audit log**: every create / reschedule / cancel through the app's Acuity link records the signed-in user, role, barber, action, Acuity ID and time. This closes the "who pressed the button" blind spot.
2. **Pattern fixes**: P1, the webhook adopts the surviving duplicate when the original is canceled. P2, check the reschedule handling against the Jeffrey records first, then fix it.
3. **Save the SOP** as a project memory so it is applied automatically to future audits.

## Technical details
- Memory file `mem://reference/acuity-desync-audit-sop` with the steps and pattern table, and a line in the index.
- New table `acuity_operator_log` (RLS: owner read only, service-role insert), written from `acuity-proxy` after the identity check.
- `acuity-webhook`: on `appointment.canceled`, look for a skipped active duplicate in `acuity_webhook_log` for the same slot and fetch/insert it from Acuity.
- P2 fix scope is decided only after re-reading Jeffrey's webhook rows (the cause is not yet proven).
