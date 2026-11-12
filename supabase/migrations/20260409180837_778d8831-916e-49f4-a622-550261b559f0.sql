-- Global check number counter
CREATE TABLE public.check_counter (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 99
);

ALTER TABLE public.check_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access check_counter"
  ON public.check_counter FOR ALL
  USING (is_owner())
  WITH CHECK (is_owner());

-- Seed with initial value
INSERT INTO public.check_counter (next_number) VALUES (99);

-- Atomic function to get and increment
CREATE OR REPLACE FUNCTION public.get_next_check_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_num integer;
BEGIN
  UPDATE public.check_counter
  SET next_number = next_number + 1
  RETURNING next_number - 1 INTO current_num;
  RETURN current_num;
END;
$$;