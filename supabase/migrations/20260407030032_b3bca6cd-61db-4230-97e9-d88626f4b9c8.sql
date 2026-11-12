
-- ============================================================
-- AgendaOS v1.0 - Complete Schema
-- ============================================================

-- Role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'barber');

-- Employment type enum
CREATE TYPE public.employment_type AS ENUM ('w2_fixed', 'commission', 'w2_variable');

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- USER ROLES (separate table per security rules)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Convenience functions using JWT (for RLS policies)
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_barber()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'barber'
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Owners can view all roles" ON public.user_roles FOR SELECT USING (public.is_owner());
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- BARBERS
-- ============================================================
CREATE TABLE public.barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  acuity_calendar_key TEXT,
  acuity_calendar_id INTEGER,
  color TEXT,
  employment_type employment_type NOT NULL,
  commission_rate NUMERIC,
  retention_rate NUMERIC,
  weekly_salary INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners full access barbers" ON public.barbers FOR ALL USING (public.is_owner());
CREATE POLICY "Barbers read active" ON public.barbers FOR SELECT USING (public.is_barber() AND is_active = true);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  barber_id UUID REFERENCES public.barbers(id),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read all profiles" ON public.profiles FOR SELECT USING (public.is_owner());
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (id = (SELECT auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (id = (SELECT auth.uid()));
CREATE POLICY "Owners manage all profiles" ON public.profiles FOR ALL USING (public.is_owner());

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en')),
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own prefs" ON public.user_preferences FOR SELECT USING (id = (SELECT auth.uid()));
CREATE POLICY "Users update own prefs" ON public.user_preferences FOR UPDATE USING (id = (SELECT auth.uid()));
CREATE POLICY "Users insert own prefs" ON public.user_preferences FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acuity_id INTEGER UNIQUE NOT NULL,
  barber_id UUID REFERENCES public.barbers(id) NOT NULL,
  client_id UUID,
  acuity_client_id INTEGER,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  service_name TEXT NOT NULL,
  service_id INTEGER,
  addons TEXT[] DEFAULT '{}',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_method TEXT CHECK (payment_method IN ('cash', 'ath_movil', 'stripe', 'paypal', 'unpaid')),
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_appointments_barber ON public.appointments(barber_id);
CREATE INDEX idx_appointments_starts ON public.appointments(starts_at);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_appointments_acuity ON public.appointments(acuity_id);

CREATE POLICY "Owner full access appointments" ON public.appointments FOR ALL USING (public.is_owner());
CREATE POLICY "Barber full access appointments" ON public.appointments FOR ALL USING (public.is_barber());

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- BLOCK TIMES
-- ============================================================
CREATE TABLE public.block_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acuity_block_id INTEGER UNIQUE,
  barber_id UUID REFERENCES public.barbers(id) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  is_multi_day BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.block_times ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_block_times_barber ON public.block_times(barber_id);
CREATE INDEX idx_block_times_starts ON public.block_times(starts_at);

CREATE POLICY "Owner full access blocks" ON public.block_times FOR ALL USING (public.is_owner());
CREATE POLICY "Barber full access blocks" ON public.block_times FOR ALL USING (public.is_barber());

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acuity_client_id INTEGER UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  preferred_barber_id UUID REFERENCES public.barbers(id),
  sms_opt_in BOOLEAN NOT NULL DEFAULT false,
  last_visit_at TIMESTAMPTZ,
  total_visits INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clients_email ON public.clients(email);
CREATE INDEX idx_clients_phone ON public.clients(phone);
CREATE INDEX idx_clients_acuity ON public.clients(acuity_client_id);

CREATE POLICY "Owner full access clients" ON public.clients FOR ALL USING (public.is_owner());

-- Add FK from appointments to clients now that clients table exists
ALTER TABLE public.appointments ADD CONSTRAINT fk_appointments_client FOREIGN KEY (client_id) REFERENCES public.clients(id);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acuity_type_id INTEGER UNIQUE NOT NULL,
  barber_id UUID REFERENCES public.barbers(id),
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  category TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access services" ON public.services FOR ALL USING (public.is_owner());
CREATE POLICY "Barber read active services" ON public.services FOR SELECT USING (public.is_barber() AND is_active = true);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER,
  stock_count INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  category TEXT,
  image_url TEXT,
  sku TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access products" ON public.products FOR ALL USING (public.is_owner());
CREATE POLICY "Barber read active products" ON public.products FOR SELECT USING (public.is_barber() AND is_active = true);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID REFERENCES public.barbers(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  type TEXT NOT NULL CHECK (type IN ('service', 'product', 'mixed')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'ath_movil', 'stripe', 'paypal')),
  subtotal_cents INTEGER NOT NULL,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  stripe_payment_id TEXT,
  paypal_order_id TEXT,
  athmovil_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  receipt_sent BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transactions_barber ON public.transactions(barber_id);
CREATE INDEX idx_transactions_client ON public.transactions(client_id);
CREATE INDEX idx_transactions_appointment ON public.transactions(appointment_id);
CREATE INDEX idx_transactions_created ON public.transactions(created_at);
CREATE INDEX idx_transactions_status ON public.transactions(status);

CREATE POLICY "Owner read all transactions" ON public.transactions FOR SELECT USING (public.is_owner());
CREATE POLICY "Owner insert transactions" ON public.transactions FOR INSERT WITH CHECK (public.is_owner());
CREATE POLICY "Barber insert transactions" ON public.transactions FOR INSERT WITH CHECK (public.is_barber());

-- ============================================================
-- TRANSACTION ITEMS
-- ============================================================
CREATE TABLE public.transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product')),
  item_id UUID,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner read all items" ON public.transaction_items FOR SELECT USING (public.is_owner());
CREATE POLICY "Owner insert items" ON public.transaction_items FOR INSERT WITH CHECK (public.is_owner());
CREATE POLICY "Barber insert items" ON public.transaction_items FOR INSERT WITH CHECK (public.is_barber());

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weekly_amount_cents INTEGER NOT NULL,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access expenses" ON public.expenses FOR ALL USING (public.is_owner());

-- ============================================================
-- SHOP SETTINGS
-- ============================================================
CREATE TABLE public.shop_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name TEXT NOT NULL DEFAULT 'Charlie''s Barbershop',
  city TEXT NOT NULL DEFAULT 'Camuy, Puerto Rico',
  owner_name TEXT NOT NULL DEFAULT 'Charlie Corchado',
  legal_entity TEXT NOT NULL DEFAULT 'C&O Ventures LLC',
  digital_fee_rate NUMERIC NOT NULL DEFAULT 0.10,
  fixed_weekly_expenses_cents INTEGER NOT NULL DEFAULT 25000,
  yvette_weekly_cap_cents INTEGER NOT NULL DEFAULT 50000,
  address TEXT DEFAULT 'PR-2 Km 93.3 Bo. Membrillo, Camuy 00627',
  phone TEXT,
  hours TEXT DEFAULT 'Martes-Sabado 9am-5pm',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access settings" ON public.shop_settings FOR ALL USING (public.is_owner());
CREATE POLICY "Barber read settings" ON public.shop_settings FOR SELECT USING (public.is_barber());

CREATE TRIGGER update_shop_settings_updated_at
  BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- CSV IMPORTS
-- ============================================================
CREATE TABLE public.csv_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by UUID REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  rows_imported INTEGER NOT NULL,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  weeks_covered TEXT[],
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.csv_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access csv_imports" ON public.csv_imports FOR ALL USING (public.is_owner());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Public read product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Owner upload product images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND public.is_owner());
CREATE POLICY "Owner delete product images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND public.is_owner());

CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

-- ============================================================
-- AUTH HOOK: Custom Access Token (injects role into JWT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  user_role public.app_role;
BEGIN
  claims := event->'claims';

  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(user_role::text));
  ELSE
    claims := jsonb_set(claims, '{app_metadata,role}', '"barber"');
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant required permissions for the auth hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.user_roles TO supabase_auth_admin;
