UPDATE public.launch_checklist
SET status='done', confirmed_at=now(), confirmed_by_note='Confirmado en chat 2026-05-11', updated_at=now()
WHERE id IN (
  '997b1b56-4550-4587-8c6f-16d1e92668f4',
  '030553a6-eb3d-4c3a-9d97-1ed07b9c7ce1',
  '0ed59919-6ef3-46e2-b0d7-9c3614da5003',
  '07eaf245-366b-4e66-8ea1-bc954c01b955',
  'a20ec0ff-891d-4eb9-8c03-100ba7ba9b62'
);