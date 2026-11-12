DO $$
DECLARE
  _ids uuid[] := ARRAY[
    'f3de2409-fb9b-490c-a2df-12a0b6c2e496','f5b819fa-5385-4510-b295-0dd305d8c319',
    '82932a60-c7fc-4d7e-9e16-8cd840d993cf','f6aeaa7c-1b0b-4ade-a96f-5e6bec607a0e',
    '92190950-018e-467e-882e-2db663cfd094','7809400f-0d1d-4b32-90b2-c9bbfc328222','e1c16a8a-a1ec-4ad7-bf9d-5a77fed40526',
    '9c8a088c-f428-4ac1-8fc9-f358b150f28a','3201a921-bf3d-418e-9fa2-3b26df4b0e8c',
    '2f4df4f7-c0be-4804-a949-757272f9669f','5c532e63-b7a5-474f-87b0-bf9672797d04','e2a9e8c0-826f-45fc-a9d3-7ceb762e8a93','5a5b02c9-ed2f-4b60-b15a-820aec3d34e7',
    '2a015481-16e2-4f3f-932b-9e3e3fa27c34','2d70c3d1-56e8-4a03-bd0d-61732fd60fb6','85d534a2-a895-4872-a093-e86b5ff7f2c7','a5f3c9bc-82be-454a-9e93-221dbf5ed2bb','c384ecfe-0c26-469e-b8bc-97939af81e54','ba4ba124-05ea-4c67-9a91-5c86f8825e4e','9b6be512-9a4d-4e18-9a0f-3042540246ed',
    '79767841-d30a-438a-9bf8-ae4c0f2dd702',
    '5cb4f0e1-497b-4306-abaf-7a15bd8426bb','38b52c87-8050-427c-9296-0d9ea6e85e00'
  ]::uuid[];
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'manual_purge_duplicate_appointments',
    'appointment', NULL,
    jsonb_build_object('appointment_ids', _ids, 'count', array_length(_ids,1),
                       'reason', 'User-requested purge: cancelled Villafeñe + non-recurring future for Jossue/Francisco/Elvin/Carlitos/Carlos/Axel/Jeriel/Josep')
  );

  DELETE FROM public.transactions WHERE appointment_id = ANY(_ids);
  DELETE FROM public.pos_payment_sessions WHERE appointment_id = ANY(_ids);
  DELETE FROM public.booking_drafts WHERE appointment_id = ANY(_ids);

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  DELETE FROM public.appointments WHERE id = ANY(_ids);
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
END $$;