import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildVocabularyProfile,
    buildVocabularyStageResult,
    getVocabularyExactCandidates,
    getVocabularyLookupCandidates,
    getVocabularyStageCategory,
    normalizeVocabularyWord,
} from '../src/utils/vocabularyProfile.js';

const source = (overrides = {}) => ({
    source_key: 'fltrp-grade-7a',
    display_name: '外研版七年级上册',
    stage_code: 'junior',
    stage_rank: 20,
    ...overrides,
});

test('normalizes case, whitespace and curly apostrophes', () => {
    assert.equal(normalizeVocabularyWord('  Children’s  Day '), "children's day");
    assert.equal(normalizeVocabularyWord('  X—ray  '), 'x-ray');
    assert.equal(normalizeVocabularyWord('artificial_intelligence'), 'artificial intelligence');
});

test('builds punctuation-safe exact candidates for words and phrases', () => {
    assert.deepEqual(getVocabularyExactCandidates('ice-cream'), ['ice-cream', 'ice cream']);
    assert.deepEqual(getVocabularyExactCandidates('ice cream'), ['ice cream', 'ice-cream']);
    assert.deepEqual(getVocabularyExactCandidates('a.m'), ['a.m', 'a.m.']);
    assert.deepEqual(getVocabularyExactCandidates('cliché'), ['cliché', 'cliche']);
});

test('generates useful candidates for common inflections', () => {
    assert.deepEqual(getVocabularyLookupCandidates('studies').slice(0, 2), ['studies', 'study']);
    assert.ok(getVocabularyLookupCandidates('running').includes('run'));
    assert.ok(getVocabularyLookupCandidates('made').includes('make'));
    assert.ok(getVocabularyLookupCandidates('bigger').includes('big'));
});

test('applies conservative first-or-last-word inflection fallback to phrases', () => {
    assert.deepEqual(getVocabularyLookupCandidates('junior high'), ['junior high', 'junior-high']);
    assert.ok(getVocabularyLookupCandidates('looked after').includes('look after'));
    assert.ok(getVocabularyLookupCandidates('credit cards').includes('credit card'));
    assert.ok(getVocabularyLookupCandidates('running-out').includes('run out'));
});

test('does not generate candidates for invalid input', () => {
    assert.deepEqual(getVocabularyLookupCandidates('北京'), []);
});

test('returns every matched source and chooses the earliest stage', () => {
    const profile = buildVocabularyProfile('important', [
        { canonical_word: 'important', word_form: 'important', source: source() },
        {
            canonical_word: 'important',
            word_form: 'important',
            source: source({
                source_key: 'moe-high-school-2020',
                display_name: '普通高中英语课程标准',
                stage_code: 'senior',
                stage_rank: 30,
            }),
        },
        {
            canonical_word: 'important',
            word_form: 'important',
            source: source({
                source_key: 'cet-4',
                display_name: 'CET-4',
                stage_code: 'college',
                stage_rank: 40,
            }),
        },
    ]);

    assert.equal(profile.status, 'matched');
    assert.equal(profile.earliestStage, 'junior');
    assert.deepEqual(profile.sources.map(item => item.display_name), [
        '外研版七年级上册',
        '普通高中英语课程标准',
        'CET-4',
    ]);
});

test('chooses the earliest display category across school and CET sources', () => {
    const result = buildVocabularyStageResult('important', [
        { source: source({ source_key: 'cet-6', stage_code: 'college', stage_rank: 50 }) },
        { source: source({ source_key: 'cet-4', stage_code: 'college', stage_rank: 40 }) },
        { source: source({ stage_code: 'junior', stage_rank: 20 }) },
    ]);

    assert.equal(result.category, 'junior');
    assert.equal(result.label, '初中');
    assert.equal(result.status, 'matched');
});

test('distinguishes CET-4 and CET-6 display categories', () => {
    assert.equal(getVocabularyStageCategory({
        source_key: 'cet-4',
        stage_code: 'college',
    }), 'cet4');
    assert.equal(getVocabularyStageCategory({
        source_key: 'cet-6',
        stage_code: 'college',
    }), 'cet6');
    assert.equal(buildVocabularyStageResult('abandon', [{
        source: { source_key: 'cet-4', stage_code: 'college' },
    }]).label, '大学四级');
    assert.equal(buildVocabularyStageResult('zeal', [{
        source: { source_key: 'cet-6', stage_code: 'college' },
    }]).label, '大学六级');
});

test('keeps unclassified and unavailable stage results distinct', () => {
    const unclassified = buildVocabularyStageResult('unlistedword');
    const unavailable = buildVocabularyStageResult('unlistedword', [], {
        unavailable: true,
    });

    assert.equal(unclassified.status, 'not_found');
    assert.equal(unclassified.label, '未分类');
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.label, '识别暂不可用');
});

test('reports an inflection match against the canonical word', () => {
    const profile = buildVocabularyProfile('studies', [
        { canonical_word: 'study', word_form: 'study', source: source() },
    ], [], { matchedByInflection: true });

    assert.equal(profile.canonicalWord, 'study');
    assert.equal(profile.matchedByInflection, true);
});

test('does not label an exact word-family member as an inferred inflection', () => {
    const profile = buildVocabularyProfile('advisor', [
        { canonical_word: 'advise', word_form: 'advisor', source: source() },
    ]);

    assert.equal(profile.inputWord, 'advisor');
    assert.equal(profile.canonicalWord, 'advise');
    assert.equal(profile.matchedByInflection, false);
});

test('keeps missing frequency and missing memberships explicit', () => {
    const profile = buildVocabularyProfile('unlistedword');
    assert.equal(profile.status, 'not_found');
    assert.equal(profile.frequency, null);
    assert.match(profile.advice, /暂未收录/);
});

test('does not infer a proper noun without source evidence', () => {
    const profile = buildVocabularyProfile('London');
    assert.equal(profile.status, 'not_found');
    assert.equal(profile.sources.length, 0);
});

test('uses corpus evidence without inventing an exam stage', () => {
    const profile = buildVocabularyProfile('everydayword', [], [{
        word: 'everydayword',
        zipf_frequency: 5.2,
        frequency_per_million: 20,
        commonness_band: 'high',
        source_key: 'subtlex-us',
    }]);

    assert.equal(profile.status, 'matched');
    assert.equal(profile.earliestStage, null);
    assert.equal(profile.frequency.label, '高');
});
