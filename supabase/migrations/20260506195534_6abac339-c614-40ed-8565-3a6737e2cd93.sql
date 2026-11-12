-- Add clients table to realtime publication so edits propagate live to all clients
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;