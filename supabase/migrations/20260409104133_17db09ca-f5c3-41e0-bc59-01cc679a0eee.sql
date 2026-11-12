ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_theme_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_theme_check CHECK (theme IN ('dark', 'light', 'system'));
UPDATE public.user_preferences SET theme = 'system' WHERE theme = 'dark';