/*
# Create core application tables for Cadence interpreter workspace

This migration creates the main data tables for the Cadence app — an interpreter
preparation workspace where each user manages their own sessions, preparation
notes, conversation entries, terminology, and follow-ups.

## Tables created

1. `profiles` — extends Supabase auth.users with app-specific fields
   - display_name, default_timezone, default_language_from/to, onboarding state
2. `sessions` — interpreter assignment sessions
   - title, client label, language pair, scheduled time + timezone, status,
     started/ended/cancelled timestamps, duration, completion summary, version
3. `session_prep` — one-to-one preparation details per session
   - goal, context, instructions, tone/register, names/pronunciation, open questions
4. `prep_checks` — explicit checklist marks (instructions_reviewed, questions_resolved, terminology_not_needed)
5. `entries` — conversation stream items (source text, interpreted text, or note)
6. `terms` — terminology pairs (source → target with context/register)
7. `followups` — post-session action items (open/done)

## Security

- RLS enabled on every table.
- All policies scoped to `TO authenticated` with `auth.uid()` ownership checks.
- `profiles` uses `auth.uid() = id` (the profile's primary key IS the auth user id).
- `sessions` uses `auth.uid() = owner_id`.
- Child tables (session_prep, prep_checks, entries, terms, followups) check
  ownership through the parent session via an EXISTS subquery, so a user can
  only read/write child rows for sessions they own.
- Owner columns default to `auth.uid()` so client inserts that omit the owner
  still satisfy INSERT WITH CHECK policies.

## Notes

1. Supabase Auth handles users, sessions, and password resets — the custom
   auth tables from the SQLite version (auth_sessions, password_reset_tokens)
   are NOT needed here.
2. Rate limiting and idempotency are operational concerns handled server-side
   and are not persisted in this database.
3. The `activity_log` is omitted as it was internal-only and never user-facing.
4. All timestamps use `timestamptz DEFAULT now()`.
5. `version` column on sessions enables optimistic concurrency control.
*/

-- ============================================================================
-- PROFILES: extends auth.users with app-specific user settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  default_timezone text NOT NULL DEFAULT 'UTC',
  default_language_from text NOT NULL DEFAULT '',
  default_language_to text NOT NULL DEFAULT '',
  onboarding_step integer NOT NULL DEFAULT 0,
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================================================
-- SESSIONS: interpreter assignment sessions (owner-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  client_label text NOT NULL DEFAULT '' CHECK (length(client_label) <= 160),
  language_from text NOT NULL,
  language_to text NOT NULL,
  scheduled_start_utc timestamptz NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  duration_seconds integer,
  completion_summary text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_owner_status_start_idx
  ON sessions(owner_id, status, scheduled_start_utc);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON sessions;
CREATE POLICY "select_own_sessions" ON sessions FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON sessions;
CREATE POLICY "insert_own_sessions" ON sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_own_sessions" ON sessions;
CREATE POLICY "update_own_sessions" ON sessions FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON sessions;
CREATE POLICY "delete_own_sessions" ON sessions FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- ============================================================================
-- SESSION_PREP: one-to-one preparation details per session
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_prep (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  goal text NOT NULL DEFAULT '',
  context text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  tone_register text NOT NULL DEFAULT '',
  names_pronunciation text NOT NULL DEFAULT '',
  open_questions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_prep ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_session_prep" ON session_prep;
CREATE POLICY "select_own_session_prep" ON session_prep FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_prep.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_session_prep" ON session_prep;
CREATE POLICY "insert_own_session_prep" ON session_prep FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_prep.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_session_prep" ON session_prep;
CREATE POLICY "update_own_session_prep" ON session_prep FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_prep.session_id AND s.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_prep.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_session_prep" ON session_prep;
CREATE POLICY "delete_own_session_prep" ON session_prep FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_prep.session_id AND s.owner_id = auth.uid())
  );

-- ============================================================================
-- PREP_CHECKS: explicit checklist marks per session
-- ============================================================================
CREATE TABLE IF NOT EXISTS prep_checks (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key IN ('instructions_reviewed','questions_resolved','terminology_not_needed')),
  state text NOT NULL CHECK (state IN ('pending','done','not_needed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, item_key)
);

ALTER TABLE prep_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_prep_checks" ON prep_checks;
CREATE POLICY "select_own_prep_checks" ON prep_checks FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = prep_checks.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_prep_checks" ON prep_checks;
CREATE POLICY "insert_own_prep_checks" ON prep_checks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = prep_checks.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_prep_checks" ON prep_checks;
CREATE POLICY "update_own_prep_checks" ON prep_checks FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = prep_checks.session_id AND s.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = prep_checks.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_prep_checks" ON prep_checks;
CREATE POLICY "delete_own_prep_checks" ON prep_checks FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = prep_checks.session_id AND s.owner_id = auth.uid())
  );

-- ============================================================================
-- ENTRIES: conversation stream items (source, interpretation, note)
-- ============================================================================
CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('source','interpretation','note')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX IF NOT EXISTS entries_session_sequence_idx
  ON entries(session_id, sequence);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_entries" ON entries;
CREATE POLICY "select_own_entries" ON entries FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = entries.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_entries" ON entries;
CREATE POLICY "insert_own_entries" ON entries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = entries.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_entries" ON entries;
CREATE POLICY "update_own_entries" ON entries FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = entries.session_id AND s.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = entries.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_entries" ON entries;
CREATE POLICY "delete_own_entries" ON entries FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = entries.session_id AND s.owner_id = auth.uid())
  );

-- ============================================================================
-- TERMS: terminology pairs (source → target with context)
-- ============================================================================
CREATE TABLE IF NOT EXISTS terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  source_term text NOT NULL CHECK (length(source_term) BETWEEN 1 AND 200),
  target_term text NOT NULL CHECK (length(target_term) BETWEEN 1 AND 200),
  context_register text NOT NULL DEFAULT '' CHECK (length(context_register) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terms_session_idx ON terms(session_id);

ALTER TABLE terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_terms" ON terms;
CREATE POLICY "select_own_terms" ON terms FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = terms.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_terms" ON terms;
CREATE POLICY "insert_own_terms" ON terms FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = terms.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_terms" ON terms;
CREATE POLICY "update_own_terms" ON terms FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = terms.session_id AND s.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = terms.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_terms" ON terms;
CREATE POLICY "delete_own_terms" ON terms FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = terms.session_id AND s.owner_id = auth.uid())
  );

-- ============================================================================
-- FOLLOWUPS: post-session action items (open/done)
-- ============================================================================
CREATE TABLE IF NOT EXISTS followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS followups_session_status_idx
  ON followups(session_id, status);

ALTER TABLE followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_followups" ON followups;
CREATE POLICY "select_own_followups" ON followups FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = followups.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_followups" ON followups;
CREATE POLICY "insert_own_followups" ON followups FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = followups.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_followups" ON followups;
CREATE POLICY "update_own_followups" ON followups FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = followups.session_id AND s.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = followups.session_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_followups" ON followups;
CREATE POLICY "delete_own_followups" ON followups FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM sessions s WHERE s.id = followups.session_id AND s.owner_id = auth.uid())
  );

-- ============================================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Interpreter'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
