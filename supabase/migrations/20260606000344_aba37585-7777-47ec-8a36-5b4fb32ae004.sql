-- Add super_owner role for cross-tenant HQ access
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_owner';