-- Phase 1B.TIMEZONE: Add shop_settings.timezone as single source of truth.
-- Storage stays UTC (timestamptz). Display & form parsing will use this column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shop_settings'
      AND column_name = 'timezone'
  ) THEN
    ALTER TABLE public.shop_settings
      ADD COLUMN timezone text NOT NULL
      DEFAULT 'America/Puerto_Rico'
      CHECK (timezone IN (
        'America/Puerto_Rico',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Anchorage',
        'Pacific/Honolulu',
        'America/Caracas',
        'America/Santo_Domingo',
        'UTC'
      ));

    COMMENT ON COLUMN public.shop_settings.timezone IS
      'IANA timezone identifier. All display timestamps formatted in this timezone. All form inputs interpreted as this timezone. Storage remains UTC.';
  END IF;

  -- Idempotent backfill of any existing rows (DEFAULT covers new rows).
  UPDATE public.shop_settings
  SET timezone = 'America/Puerto_Rico'
  WHERE timezone IS NULL;
END $$;