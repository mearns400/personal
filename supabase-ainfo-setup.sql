-- ═══════════════════════════════════════════════════════════
-- Andrew Mearns Portfolio — AINFO Tables Setup
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ─── 1. ainfo_company ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ainfo_company (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date  date NOT NULL,
  end_date    date,
  company_name text NOT NULL,
  description text,
  ai_title    text,
  ai_summary  text,
  color       text NOT NULL DEFAULT '#1e46be',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ainfo_company ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public can read ainfo_company" ON public.ainfo_company;
CREATE POLICY "public can read ainfo_company"
  ON public.ainfo_company FOR SELECT TO anon USING (true);

-- ─── 2. ainfo_role ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ainfo_role (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date    date NOT NULL,
  end_date      date,
  title         text NOT NULL,
  responsibilities text,
  ai_title      text,
  ai_summary    text,
  color         text NOT NULL DEFAULT '#0082dc',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ainfo_role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public can read ainfo_role" ON public.ainfo_role;
CREATE POLICY "public can read ainfo_role"
  ON public.ainfo_role FOR SELECT TO anon USING (true);

-- ─── 3. ainfo_accomplishments ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ainfo_accomplishments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date  date NOT NULL,
  end_date    date,
  description text NOT NULL,
  ai_title    text,
  ai_summary  text,
  color       text NOT NULL DEFAULT '#00cdff',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ainfo_accomplishments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public can read ainfo_accomplishments" ON public.ainfo_accomplishments;
CREATE POLICY "public can read ainfo_accomplishments"
  ON public.ainfo_accomplishments FOR SELECT TO anon USING (true);

-- ─── 4. ainfo_personal ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ainfo_personal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date  date NOT NULL,
  end_date    date,
  description text NOT NULL,
  ai_title    text,
  ai_summary  text,
  color       text NOT NULL DEFAULT '#c46414',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ainfo_personal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public can read ainfo_personal" ON public.ainfo_personal;
CREATE POLICY "public can read ainfo_personal"
  ON public.ainfo_personal FOR SELECT TO anon USING (true);
