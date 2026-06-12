-- ============================================
-- Word Builder 2 - Database Migration Script
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Built-in Wordlists (shared, read-only for users)
CREATE TABLE IF NOT EXISTS built_in_wordlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Built-in Words
CREATE TABLE IF NOT EXISTS built_in_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wordlist_id UUID REFERENCES built_in_wordlists(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  meaning_cn TEXT NOT NULL,
  unit TEXT,
  phonetic TEXT,
  example TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Custom Wordlists (per user)
CREATE TABLE IF NOT EXISTS custom_wordlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Custom Words (per user)
CREATE TABLE IF NOT EXISTS custom_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wordlist_id UUID REFERENCES custom_wordlists(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  meaning_cn TEXT,
  phonetic TEXT,
  example TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. User Word State (learning progress, keyed by user_id + word text)
CREATE TABLE IF NOT EXISTS user_word_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  level INTEGER DEFAULT 0,
  next_review_at DATE,
  last_seen_at TIMESTAMPTZ,
  wrong_count INTEGER DEFAULT 0,
  correct_streak INTEGER DEFAULT 0,
  next_usage_variant_index INTEGER NOT NULL DEFAULT 0 CHECK (next_usage_variant_index IN (0, 1)),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, word)
);

-- 6. Sessions (learning records)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  type TEXT DEFAULT 'all',
  new_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  spelling_accuracy FLOAT DEFAULT 0,
  self_eval_stats JSONB DEFAULT '{}',
  duration_seconds INTEGER DEFAULT 0,
  hardest_word TEXT,
  level_ups INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. User Settings
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  daily_new INTEGER DEFAULT 10,
  review_cap INTEGER DEFAULT 10,
  relapse_cap INTEGER DEFAULT 10,
  tts_enabled BOOLEAN DEFAULT true,
  tts_rate FLOAT DEFAULT 1.0,
  sound_enabled BOOLEAN DEFAULT true,
  usage_scene_mode TEXT NOT NULL DEFAULT 'rotate' CHECK (usage_scene_mode IN ('rotate', 'fixed_a')),
  daily_gen_count INTEGER DEFAULT 0,
  last_gen_date DATE,
  daily_usage_gen_count INTEGER DEFAULT 0,
  last_usage_gen_date DATE,
  daily_usage_grade_count INTEGER DEFAULT 0,
  last_usage_grade_date DATE,
  daily_usage_question_count INTEGER DEFAULT 0,
  last_usage_question_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Usage Exercises (per-user AI-generated scenario prompts)
CREATE TABLE IF NOT EXISTS user_usage_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word TEXT NOT NULL,
  meaning_cn TEXT NOT NULL DEFAULT '',
  variant_index INTEGER NOT NULL DEFAULT 0 CHECK (variant_index IN (0, 1)),
  prompt_cn TEXT NOT NULL,
  reference_answer_en TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, word, meaning_cn, variant_index)
);

-- 9. Active Study Sessions (temporary cross-browser resume state)
CREATE TABLE IF NOT EXISTS active_study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT DEFAULT 'active',
  session_type TEXT DEFAULT 'all',
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Existing projects can re-run this migration safely.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_usage_gen_count INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_usage_gen_date DATE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_usage_grade_count INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_usage_grade_date DATE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_usage_question_count INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_usage_question_date DATE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS usage_scene_mode TEXT NOT NULL DEFAULT 'rotate';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_settings ALTER COLUMN review_cap SET DEFAULT 10;
ALTER TABLE user_word_state ADD COLUMN IF NOT EXISTS next_usage_variant_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_usage_exercises ADD COLUMN IF NOT EXISTS variant_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_usage_exercises DROP CONSTRAINT IF EXISTS user_usage_exercises_user_id_word_meaning_cn_key;

DELETE FROM user_usage_exercises old_row
USING user_usage_exercises keep_row
WHERE old_row.user_id = keep_row.user_id
  AND old_row.word = keep_row.word
  AND old_row.meaning_cn = keep_row.meaning_cn
  AND old_row.variant_index = keep_row.variant_index
  AND (
    COALESCE(old_row.updated_at, old_row.created_at) < COALESCE(keep_row.updated_at, keep_row.created_at)
    OR (
      COALESCE(old_row.updated_at, old_row.created_at) = COALESCE(keep_row.updated_at, keep_row.created_at)
      AND old_row.ctid < keep_row.ctid
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_usage_scene_mode_check'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_usage_scene_mode_check
      CHECK (usage_scene_mode IN ('rotate', 'fixed_a'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_word_state_next_usage_variant_index_check'
  ) THEN
    ALTER TABLE user_word_state
      ADD CONSTRAINT user_word_state_next_usage_variant_index_check
      CHECK (next_usage_variant_index IN (0, 1));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_usage_exercises_variant_index_check'
  ) THEN
    ALTER TABLE user_usage_exercises
      ADD CONSTRAINT user_usage_exercises_variant_index_check
      CHECK (variant_index IN (0, 1));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_usage_exercises_user_id_word_meaning_cn_variant_index_key'
  ) THEN
    ALTER TABLE user_usage_exercises
      ADD CONSTRAINT user_usage_exercises_user_id_word_meaning_cn_variant_index_key
      UNIQUE (user_id, word, meaning_cn, variant_index);
  END IF;
END $$;

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Built-in tables: read-only for all authenticated users
ALTER TABLE built_in_wordlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE built_in_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read built_in_wordlists" ON built_in_wordlists;
CREATE POLICY "Anyone can read built_in_wordlists"
  ON built_in_wordlists FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can read built_in_words" ON built_in_words;
CREATE POLICY "Anyone can read built_in_words"
  ON built_in_words FOR SELECT
  TO authenticated
  USING (true);

-- User-specific tables: full access only for own data
ALTER TABLE custom_wordlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_word_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_study_sessions ENABLE ROW LEVEL SECURITY;

-- custom_wordlists
DROP POLICY IF EXISTS "Users can manage own custom_wordlists" ON custom_wordlists;
CREATE POLICY "Users can manage own custom_wordlists"
  ON custom_wordlists FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- custom_words
DROP POLICY IF EXISTS "Users can manage own custom_words" ON custom_words;
CREATE POLICY "Users can manage own custom_words"
  ON custom_words FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_word_state
DROP POLICY IF EXISTS "Users can manage own user_word_state" ON user_word_state;
CREATE POLICY "Users can manage own user_word_state"
  ON user_word_state FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- sessions
DROP POLICY IF EXISTS "Users can manage own sessions" ON sessions;
CREATE POLICY "Users can manage own sessions"
  ON sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_settings
DROP POLICY IF EXISTS "Users can manage own user_settings" ON user_settings;
CREATE POLICY "Users can manage own user_settings"
  ON user_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_usage_exercises
DROP POLICY IF EXISTS "Users can manage own user_usage_exercises" ON user_usage_exercises;
CREATE POLICY "Users can manage own user_usage_exercises"
  ON user_usage_exercises FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- active_study_sessions
DROP POLICY IF EXISTS "Users can manage own active_study_sessions" ON active_study_sessions;
CREATE POLICY "Users can manage own active_study_sessions"
  ON active_study_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_word_state_review
  ON user_word_state(user_id, next_review_at);

CREATE INDEX IF NOT EXISTS idx_user_word_state_word
  ON user_word_state(user_id, word);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date
  ON sessions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_built_in_words_wordlist
  ON built_in_words(wordlist_id);

CREATE INDEX IF NOT EXISTS idx_custom_words_wordlist
  ON custom_words(wordlist_id);

CREATE INDEX IF NOT EXISTS idx_user_usage_exercises_word
  ON user_usage_exercises(user_id, word);

CREATE INDEX IF NOT EXISTS idx_user_usage_exercises_variant
  ON user_usage_exercises(user_id, word, meaning_cn, variant_index);

CREATE INDEX IF NOT EXISTS idx_active_study_sessions_user
  ON active_study_sessions(user_id);

-- ============================================
-- Admin Analytics
-- ============================================

-- Admin whitelist. Insert lowercase emails manually in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lightweight analytics events. Payloads must not contain prompts, answers, or secrets.
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own analytics_events" ON analytics_events;
CREATE POLICY "Users can insert own analytics_events"
  ON analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_date
  ON analytics_events(user_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_date
  ON analytics_events(event_name, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at DESC);

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

CREATE OR REPLACE FUNCTION mask_admin_email(input_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH parts AS (
    SELECT
      split_part(coalesce(input_email, ''), '@', 1) AS local_part,
      split_part(coalesce(input_email, ''), '@', 2) AS domain_part
  )
  SELECT CASE
    WHEN input_email IS NULL OR position('@' IN input_email) = 0 THEN ''
    WHEN length(local_part) <= 2 THEN left(local_part, 1) || '***@' || domain_part
    ELSE left(local_part, 2) || '***' || right(local_part, 1) || '@' || domain_part
  END
  FROM parts;
$$;

CREATE OR REPLACE FUNCTION get_admin_dashboard(start_date DATE DEFAULT (CURRENT_DATE - 30), end_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  range_start DATE := COALESCE(start_date, CURRENT_DATE - 30);
  range_end DATE := COALESCE(end_date, CURRENT_DATE);
  dashboard JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF range_start > range_end THEN
    RAISE EXCEPTION 'start_date must be before or equal to end_date' USING ERRCODE = '22007';
  END IF;

  SELECT jsonb_build_object(
    'overview', (
      WITH active AS (
        SELECT user_id FROM public.sessions WHERE date BETWEEN range_start AND range_end
        UNION
        SELECT user_id FROM public.analytics_events WHERE event_date BETWEEN range_start AND range_end
      ),
      session_stats AS (
        SELECT
          count(*) AS session_count,
          COALESCE(sum(duration_seconds), 0) AS duration_seconds,
          COALESCE(sum(new_count), 0) AS new_words,
          COALESCE(sum(review_count), 0) AS review_words,
          COALESCE(sum(level_ups), 0) AS level_ups,
          COALESCE(round(avg(spelling_accuracy)::numeric, 2), 0) AS average_accuracy
        FROM public.sessions
        WHERE date BETWEEN range_start AND range_end
      )
      SELECT jsonb_build_object(
        'totalUsers', (SELECT count(*) FROM auth.users),
        'activeUsers', (SELECT count(*) FROM active),
        'inactiveUsers', greatest((SELECT count(*) FROM auth.users) - (SELECT count(*) FROM active), 0),
        'completedSessions', session_count,
        'studyMinutes', floor(duration_seconds / 60.0)::int,
        'newWords', new_words,
        'reviewWords', review_words,
        'levelUps', level_ups,
        'averageAccuracy', average_accuracy,
        'aiCalls', (
          SELECT count(*)
          FROM public.analytics_events
          WHERE event_name = 'ai_call'
            AND event_date BETWEEN range_start AND range_end
        ),
        'masteredWords', (
          SELECT count(*)
          FROM public.user_word_state
          WHERE level >= 3
        ),
        'incompleteSessions', (
          SELECT count(*)
          FROM public.active_study_sessions
          WHERE status = 'active'
            AND updated_at < now() - interval '30 minutes'
        )
      )
      FROM session_stats
    ),
    'dailyMetrics', (
      WITH days AS (
        SELECT generate_series(range_start::timestamp, range_end::timestamp, interval '1 day')::date AS day
      ),
      session_daily AS (
        SELECT
          date AS day,
          count(*) AS sessions,
          COALESCE(sum(new_count), 0) AS new_words,
          COALESCE(sum(review_count), 0) AS review_words,
          COALESCE(sum(duration_seconds), 0) AS duration_seconds,
          COALESCE(round(avg(spelling_accuracy)::numeric, 2), 0) AS average_accuracy
        FROM public.sessions
        WHERE date BETWEEN range_start AND range_end
        GROUP BY date
      ),
      active_daily AS (
        SELECT day, count(DISTINCT user_id) AS active_users
        FROM (
          SELECT date AS day, user_id FROM public.sessions WHERE date BETWEEN range_start AND range_end
          UNION ALL
          SELECT event_date AS day, user_id FROM public.analytics_events WHERE event_date BETWEEN range_start AND range_end
        ) activity
        GROUP BY day
      ),
      ai_daily AS (
        SELECT event_date AS day, count(*) AS ai_calls
        FROM public.analytics_events
        WHERE event_name = 'ai_call'
          AND event_date BETWEEN range_start AND range_end
        GROUP BY event_date
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', days.day::text,
        'activeUsers', COALESCE(active_daily.active_users, 0),
        'sessions', COALESCE(session_daily.sessions, 0),
        'newWords', COALESCE(session_daily.new_words, 0),
        'reviewWords', COALESCE(session_daily.review_words, 0),
        'studyMinutes', floor(COALESCE(session_daily.duration_seconds, 0) / 60.0)::int,
        'averageAccuracy', COALESCE(session_daily.average_accuracy, 0),
        'aiCalls', COALESCE(ai_daily.ai_calls, 0)
      ) ORDER BY days.day), '[]'::jsonb)
      FROM days
      LEFT JOIN session_daily ON session_daily.day = days.day
      LEFT JOIN active_daily ON active_daily.day = days.day
      LEFT JOIN ai_daily ON ai_daily.day = days.day
    ),
    'users', (
      WITH session_range AS (
        SELECT
          user_id,
          count(*) AS session_count,
          COALESCE(sum(duration_seconds), 0) AS duration_seconds,
          COALESCE(round(avg(spelling_accuracy)::numeric, 2), 0) AS average_accuracy,
          max(created_at) AS last_session_at
        FROM public.sessions
        WHERE date BETWEEN range_start AND range_end
        GROUP BY user_id
      ),
      event_range AS (
        SELECT
          user_id,
          count(*) FILTER (WHERE event_name = 'ai_call') AS ai_calls
        FROM public.analytics_events
        WHERE event_date BETWEEN range_start AND range_end
        GROUP BY user_id
      ),
      word_stats AS (
        SELECT
          user_id,
          count(*) AS studied_words,
          count(*) FILTER (WHERE level >= 3) AS mastered_words
        FROM public.user_word_state
        GROUP BY user_id
      ),
      last_activity AS (
        SELECT user_id, max(activity_at) AS last_active_at
        FROM (
          SELECT user_id, max(created_at) AS activity_at FROM public.sessions GROUP BY user_id
          UNION ALL
          SELECT user_id, max(created_at) AS activity_at FROM public.analytics_events GROUP BY user_id
          UNION ALL
          SELECT user_id, max(updated_at) AS activity_at FROM public.active_study_sessions GROUP BY user_id
        ) activity
        GROUP BY user_id
      ),
      rows AS (
        SELECT
          row_number() OVER (ORDER BY last_activity.last_active_at DESC NULLS LAST, u.created_at DESC) AS sort_order,
          u.id,
          u.email,
          u.created_at,
          last_activity.last_active_at,
          COALESCE(session_range.session_count, 0) AS session_count,
          COALESCE(session_range.duration_seconds, 0) AS duration_seconds,
          COALESCE(session_range.average_accuracy, 0) AS average_accuracy,
          COALESCE(word_stats.studied_words, 0) AS studied_words,
          COALESCE(word_stats.mastered_words, 0) AS mastered_words,
          COALESCE(event_range.ai_calls, 0) AS ai_calls,
          active.id IS NOT NULL AS has_active_session
        FROM auth.users u
        LEFT JOIN session_range ON session_range.user_id = u.id
        LEFT JOIN event_range ON event_range.user_id = u.id
        LEFT JOIN word_stats ON word_stats.user_id = u.id
        LEFT JOIN last_activity ON last_activity.user_id = u.id
        LEFT JOIN public.active_study_sessions active ON active.user_id = u.id AND active.status = 'active'
        ORDER BY last_activity.last_active_at DESC NULLS LAST, u.created_at DESC
        LIMIT 100
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', id,
        'userIdShort', left(id::text, 8),
        'emailMasked', public.mask_admin_email(email),
        'createdAt', created_at,
        'lastActiveAt', last_active_at,
        'sessions', session_count,
        'studyMinutes', floor(duration_seconds / 60.0)::int,
        'averageAccuracy', average_accuracy,
        'studiedWords', studied_words,
        'masteredWords', mastered_words,
        'aiCalls', ai_calls,
        'hasActiveSession', has_active_session
      ) ORDER BY sort_order), '[]'::jsonb)
      FROM rows
    ),
    'hardWords', (
      WITH failures AS (
        SELECT
          lower(metadata ->> 'word') AS word,
          event_name AS failure_type
        FROM public.analytics_events
        WHERE event_name IN ('recall_failed', 'spelling_failed', 'usage_failed')
          AND event_date BETWEEN range_start AND range_end
          AND metadata ? 'word'
        UNION ALL
        SELECT
          lower(hardest_word) AS word,
          'session_hardest' AS failure_type
        FROM public.sessions
        WHERE date BETWEEN range_start AND range_end
          AND hardest_word IS NOT NULL
          AND hardest_word <> ''
      ),
      grouped AS (
        SELECT word, failure_type, count(*) AS failure_count
        FROM failures
        WHERE word IS NOT NULL AND word <> ''
        GROUP BY word, failure_type
        ORDER BY failure_count DESC, word ASC
        LIMIT 20
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'word', word,
        'failureType', failure_type,
        'count', failure_count
      ) ORDER BY failure_count DESC, word ASC), '[]'::jsonb)
      FROM grouped
    ),
    'incompleteSessions', (
      WITH stale AS (
        SELECT
          active.user_id,
          active.session_type,
          active.updated_at,
          u.email
        FROM public.active_study_sessions active
        JOIN auth.users u ON u.id = active.user_id
        WHERE active.status = 'active'
          AND active.updated_at < now() - interval '30 minutes'
        ORDER BY active.updated_at ASC
        LIMIT 20
      )
      SELECT jsonb_build_object(
        'count', count(*),
        'staleAfterMinutes', 30,
        'sessions', COALESCE(jsonb_agg(jsonb_build_object(
          'userId', user_id,
          'userIdShort', left(user_id::text, 8),
          'emailMasked', public.mask_admin_email(email),
          'sessionType', session_type,
          'updatedAt', updated_at
        ) ORDER BY updated_at ASC), '[]'::jsonb)
      )
      FROM stale
    )
  ) INTO dashboard;

  RETURN dashboard;
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_user_detail(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  detail JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'userId', u.id,
        'userIdShort', left(u.id::text, 8),
        'emailMasked', public.mask_admin_email(u.email),
        'createdAt', u.created_at,
        'lastSignInAt', u.last_sign_in_at
      )
      FROM auth.users u
      WHERE u.id = target_user_id
    ),
    'summary', (
      SELECT jsonb_build_object(
        'sessions', count(*),
        'studyMinutes', floor(COALESCE(sum(duration_seconds), 0) / 60.0)::int,
        'averageAccuracy', COALESCE(round(avg(spelling_accuracy)::numeric, 2), 0),
        'newWords', COALESCE(sum(new_count), 0),
        'reviewWords', COALESCE(sum(review_count), 0),
        'levelUps', COALESCE(sum(level_ups), 0),
        'studiedWords', (
          SELECT count(*) FROM public.user_word_state WHERE user_id = target_user_id
        ),
        'masteredWords', (
          SELECT count(*) FROM public.user_word_state WHERE user_id = target_user_id AND level >= 3
        ),
        'dueWords', (
          SELECT count(*) FROM public.user_word_state WHERE user_id = target_user_id AND next_review_at <= CURRENT_DATE
        ),
        'aiCalls', (
          SELECT count(*) FROM public.analytics_events WHERE user_id = target_user_id AND event_name = 'ai_call'
        )
      )
      FROM public.sessions
      WHERE user_id = target_user_id
    ),
    'levelDistribution', (
      SELECT COALESCE(jsonb_object_agg(level::text, level_count), '{}'::jsonb)
      FROM (
        SELECT level, count(*) AS level_count
        FROM public.user_word_state
        WHERE user_id = target_user_id
        GROUP BY level
      ) levels
    ),
    'recentSessions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'date', date,
        'type', type,
        'newCount', new_count,
        'reviewCount', review_count,
        'spellingAccuracy', spelling_accuracy,
        'selfEvalStats', self_eval_stats,
        'durationSeconds', duration_seconds,
        'hardestWord', hardest_word,
        'levelUps', level_ups,
        'createdAt', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.sessions
        WHERE user_id = target_user_id
        ORDER BY created_at DESC
        LIMIT 20
      ) recent
    ),
    'hardWords', (
      WITH failures AS (
        SELECT
          lower(metadata ->> 'word') AS word,
          event_name AS failure_type
        FROM public.analytics_events
        WHERE user_id = target_user_id
          AND event_name IN ('recall_failed', 'spelling_failed', 'usage_failed')
          AND metadata ? 'word'
        UNION ALL
        SELECT lower(hardest_word) AS word, 'session_hardest' AS failure_type
        FROM public.sessions
        WHERE user_id = target_user_id
          AND hardest_word IS NOT NULL
          AND hardest_word <> ''
      ),
      grouped AS (
        SELECT word, failure_type, count(*) AS failure_count
        FROM failures
        WHERE word IS NOT NULL AND word <> ''
        GROUP BY word, failure_type
        ORDER BY failure_count DESC, word ASC
        LIMIT 20
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'word', word,
        'failureType', failure_type,
        'count', failure_count
      ) ORDER BY failure_count DESC, word ASC), '[]'::jsonb)
      FROM grouped
    ),
    'aiUsage', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'action', action,
        'status', status,
        'count', usage_count
      ) ORDER BY usage_count DESC, action ASC, status ASC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(metadata ->> 'action', 'unknown') AS action,
          COALESCE(metadata ->> 'status', 'unknown') AS status,
          count(*) AS usage_count
        FROM public.analytics_events
        WHERE user_id = target_user_id
          AND event_name = 'ai_call'
        GROUP BY action, status
      ) usage
    ),
    'recentEvents', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'eventName', event_name,
        'eventDate', event_date,
        'metadata', metadata,
        'createdAt', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (
        SELECT event_name, event_date, metadata, created_at
        FROM public.analytics_events
        WHERE user_id = target_user_id
        ORDER BY created_at DESC
        LIMIT 40
      ) recent
    ),
    'activeSession', (
      SELECT jsonb_build_object(
        'status', status,
        'sessionType', session_type,
        'updatedAt', updated_at,
        'createdAt', created_at
      )
      FROM public.active_study_sessions
      WHERE user_id = target_user_id
        AND status = 'active'
      LIMIT 1
    )
  ) INTO detail;

  RETURN detail;
END;
$$;

REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_dashboard(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_user_detail(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_dashboard(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_user_detail(UUID) TO authenticated;

-- ============================================
-- Insert built-in wordlists
-- ============================================
INSERT INTO built_in_wordlists (id, name, description) VALUES
  ('11111111-1111-1111-1111-111111111111', '七年级上册', '外研版新课标七年级上册词汇'),
  ('22222222-2222-2222-2222-222222222222', '七年级下册', '外研版新课标七年级下册词汇')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;
