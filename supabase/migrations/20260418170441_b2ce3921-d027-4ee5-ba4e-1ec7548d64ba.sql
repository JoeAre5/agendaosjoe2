-- Anthony Borrero: attach real Acuity appointment to the recurring group
UPDATE appointments
SET is_recurring = true,
    recurring_group_id = '43c449e1-4d30-4319-aa4b-a0ad62389ef6'
WHERE id = 'a6211208-8c65-428e-9bcc-dfbf3a9f4aef';

-- Carlos Torres: cancel phantom recurring sibling (placeholder acuity_id)
UPDATE appointments
SET status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_role = 'owner'
WHERE id = 'a4c02529-9036-4f06-97c6-45d1ff69d966';