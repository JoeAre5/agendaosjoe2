ALTER PUBLICATION supabase_realtime ADD TABLE public.block_times;
ALTER TABLE public.block_times REPLICA IDENTITY FULL;