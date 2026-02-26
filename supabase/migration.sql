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
  review_cap INTEGER DEFAULT 40,
  relapse_cap INTEGER DEFAULT 10,
  tts_enabled BOOLEAN DEFAULT true,
  tts_rate FLOAT DEFAULT 1.0,
  daily_gen_count INTEGER DEFAULT 0,
  last_gen_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Built-in tables: read-only for all authenticated users
ALTER TABLE built_in_wordlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE built_in_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read built_in_wordlists"
  ON built_in_wordlists FOR SELECT
  TO authenticated
  USING (true);

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

-- custom_wordlists
CREATE POLICY "Users can manage own custom_wordlists"
  ON custom_wordlists FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- custom_words
CREATE POLICY "Users can manage own custom_words"
  ON custom_words FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_word_state
CREATE POLICY "Users can manage own user_word_state"
  ON user_word_state FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- sessions
CREATE POLICY "Users can manage own sessions"
  ON sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_settings
CREATE POLICY "Users can manage own user_settings"
  ON user_settings FOR ALL
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

-- ============================================
-- Insert built-in wordlists
-- ============================================
INSERT INTO built_in_wordlists (id, name, description) VALUES
  ('11111111-1111-1111-1111-111111111111', '七年级上册', '外研版新课标七年级上册词汇'),
  ('22222222-2222-2222-2222-222222222222', '七年级下册', '外研版新课标七年级下册词汇');
