-- ============================================
-- Build the verified vocabulary lookup index
-- Run AFTER migration.sql, import_grade7a.sql, and import_grade7b.sql.
-- This script is idempotent.
-- ============================================

INSERT INTO vocabulary_memberships (
  source_key,
  canonical_word,
  word_form,
  coverage_label
)
SELECT
  CASE wordlist_id
    WHEN '11111111-1111-1111-1111-111111111111'::uuid THEN 'fltrp-grade-7a'
    WHEN '22222222-2222-2222-2222-222222222222'::uuid THEN 'fltrp-grade-7b'
  END,
  lower(trim(word)),
  lower(trim(word)),
  COALESCE(unit, '')
FROM built_in_words
WHERE wordlist_id IN (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid
)
  AND trim(word) <> ''
ON CONFLICT (source_key, canonical_word, word_form) DO UPDATE SET
  coverage_label = EXCLUDED.coverage_label;

UPDATE vocabulary_sources
SET is_complete = true, updated_at = now()
WHERE source_key = 'fltrp-grade-7a'
  AND EXISTS (
    SELECT 1 FROM vocabulary_memberships
    WHERE source_key = 'fltrp-grade-7a'
  );

UPDATE vocabulary_sources
SET is_complete = true, updated_at = now()
WHERE source_key = 'fltrp-grade-7b'
  AND EXISTS (
    SELECT 1 FROM vocabulary_memberships
    WHERE source_key = 'fltrp-grade-7b'
  );

-- Import contract for additional verified sources:
--
-- INSERT INTO vocabulary_memberships
--   (source_key, canonical_word, word_form, coverage_label)
-- VALUES
--   ('moe-high-school-2020', 'example', 'example', '课标词汇表')
-- ON CONFLICT (source_key, canonical_word, word_form) DO UPDATE
-- SET coverage_label = EXCLUDED.coverage_label;
--
-- UPDATE vocabulary_sources
-- SET is_complete = true, updated_at = now()
-- WHERE source_key = 'moe-high-school-2020';
--
-- SUBTLEX-US frequency bands use Zipf frequency:
--   high >= 5, medium >= 3.5, low < 3.5
--
-- INSERT INTO word_frequencies
--   (word, source_key, zipf_frequency, frequency_per_million, commonness_band)
-- VALUES
--   ('example', 'subtlex-us', 4.8, 63.0, 'medium')
-- ON CONFLICT (word, source_key) DO UPDATE SET
--   zipf_frequency = EXCLUDED.zipf_frequency,
--   frequency_per_million = EXCLUDED.frequency_per_million,
--   commonness_band = EXCLUDED.commonness_band;
