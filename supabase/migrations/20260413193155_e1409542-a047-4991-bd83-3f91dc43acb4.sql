
ALTER TABLE public.appointments
  DROP CONSTRAINT fk_appointments_client,
  ADD CONSTRAINT fk_appointments_client
    FOREIGN KEY (client_id) REFERENCES public.clients(id)
    ON DELETE SET NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_client_id_fkey,
  ADD CONSTRAINT transactions_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id)
    ON DELETE SET NULL;
