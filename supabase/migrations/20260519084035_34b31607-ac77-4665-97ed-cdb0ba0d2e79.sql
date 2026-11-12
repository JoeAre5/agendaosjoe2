UPDATE public.launch_checklist
SET status = 'done',
    confirmed_at = COALESCE(confirmed_at, now()),
    confirmed_by_note = COALESCE(confirmed_by_note, 'Mirror /cb-build-2026/* removed; ComingSoonPage interceptor gone; real routes wired in App.tsx; preview now uses ?preview=1.')
WHERE id IN (
  'd16c6ff2-fdd5-4dc6-a80f-3867414e3e5e',
  '65d59390-637e-42fa-a2a7-e80704b9b572'
);