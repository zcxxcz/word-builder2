import { supabase } from './supabase';
import {
    buildVocabularyProfile,
    buildVocabularyStageResult,
    getVocabularyExactCandidates,
    getVocabularyLookupCandidates,
    normalizeVocabularyWord,
} from '../utils/vocabularyProfile';

const MEMBERSHIP_SELECT = `
    canonical_word,
    word_form,
    coverage_label,
    source:vocabulary_sources (
        source_key,
        display_name,
        source_type,
        stage_code,
        stage_rank,
        version_label,
        volume_label,
        source_url,
        is_complete
    )
`;

const STAGE_MEMBERSHIP_SELECT = `
    canonical_word,
    word_form,
    source:vocabulary_sources (
        source_key,
        stage_code,
        stage_rank
    )
`;

const LOOKUP_CHUNK_SIZE = 150;

function mergeMemberships(...groups) {
    const seen = new Set();
    const merged = [];
    for (const item of groups.flat()) {
        const key = `${item.source?.source_key || ''}\u0000${item.canonical_word}\u0000${item.word_form}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
    }
    return merged;
}

function mergeFrequencies(...groups) {
    const seen = new Set();
    const merged = [];
    for (const item of groups.flat()) {
        const key = `${item.source_key || ''}\u0000${item.word || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
    }
    return merged;
}

function queryMemberships(candidates) {
    if (!candidates.length) return Promise.resolve({ data: [], error: null });
    return supabase
        .from('vocabulary_memberships')
        .select(MEMBERSHIP_SELECT)
        .in('word_form', candidates);
}

async function queryStageMemberships(candidates) {
    if (!candidates.length) return { data: [], error: null };

    const chunks = [];
    for (let index = 0; index < candidates.length; index += LOOKUP_CHUNK_SIZE) {
        chunks.push(candidates.slice(index, index + LOOKUP_CHUNK_SIZE));
    }

    const results = [];
    for (const chunk of chunks) {
        const result = await supabase
            .from('vocabulary_memberships')
            .select(STAGE_MEMBERSHIP_SELECT)
            .in('word_form', chunk);
        results.push(result);
        if (result.error) break;
    }
    const error = results.find(result => result.error)?.error || null;
    return {
        data: results.flatMap(result => result.data || []),
        error,
    };
}

function buildCandidateOwners(words, getCandidates, excludedCandidates = new Map()) {
    const owners = new Map();
    for (const word of words) {
        const excluded = excludedCandidates.get(word) || new Set();
        for (const candidate of getCandidates(word)) {
            if (excluded.has(candidate)) continue;
            if (!owners.has(candidate)) owners.set(candidate, new Set());
            owners.get(candidate).add(word);
        }
    }
    return owners;
}

function assignMembershipsToWords(memberships, owners) {
    const assigned = new Map();
    for (const membership of memberships || []) {
        for (const word of owners.get(membership.word_form) || []) {
            if (!assigned.has(word)) assigned.set(word, []);
            assigned.get(word).push(membership);
        }
    }
    return assigned;
}

export async function lookupVocabularyStages(words) {
    const normalizedWords = [...new Set(
        (words || []).map(normalizeVocabularyWord).filter(Boolean)
    )];
    const unavailableResults = () => new Map(normalizedWords.map(word => [
        word,
        buildVocabularyStageResult(word, [], { unavailable: true }),
    ]));
    if (normalizedWords.length === 0) return new Map();

    try {
        const exactCandidatesByWord = new Map(normalizedWords.map(word => [
            word,
            new Set(getVocabularyExactCandidates(word)),
        ]));
        const exactOwners = buildCandidateOwners(
            normalizedWords,
            getVocabularyExactCandidates
        );
        const exactResult = await queryStageMemberships([...exactOwners.keys()]);
        if (exactResult.error) return unavailableResults();

        const exactMemberships = assignMembershipsToWords(exactResult.data, exactOwners);
        const exactProfiles = new Map(normalizedWords.map(word => [
            word,
            buildVocabularyStageResult(word, exactMemberships.get(word) || []),
        ]));
        const unmatchedWords = normalizedWords.filter(
            word => exactProfiles.get(word).status === 'not_found'
        );

        let fallbackMemberships = new Map();
        if (unmatchedWords.length > 0) {
            const fallbackOwners = buildCandidateOwners(
                unmatchedWords,
                getVocabularyLookupCandidates,
                exactCandidatesByWord
            );
            const fallbackResult = await queryStageMemberships([...fallbackOwners.keys()]);
            if (fallbackResult.error) return unavailableResults();
            fallbackMemberships = assignMembershipsToWords(
                fallbackResult.data,
                fallbackOwners
            );
        }

        return new Map(normalizedWords.map(word => {
            const exactProfile = exactProfiles.get(word);
            if (exactProfile.status === 'matched') return [word, exactProfile];
            return [
                word,
                buildVocabularyStageResult(
                    word,
                    fallbackMemberships.get(word) || [],
                    { matchedByInflection: Boolean(fallbackMemberships.get(word)?.length) }
                ),
            ];
        }));
    } catch (error) {
        console.warn('Vocabulary stage index is unavailable:', error);
        return unavailableResults();
    }
}

export async function lookupVocabularyStage(word) {
    const normalizedWord = normalizeVocabularyWord(word);
    if (!normalizedWord) return buildVocabularyStageResult('');
    const results = await lookupVocabularyStages([normalizedWord]);
    return results.get(normalizedWord) || buildVocabularyStageResult(normalizedWord);
}

function queryFrequencies(candidates) {
    if (!candidates.length) return Promise.resolve({ data: [], error: null });
    return supabase
        .from('word_frequencies')
        .select('word, zipf_frequency, frequency_per_million, commonness_band, source_key')
        .in('word', candidates)
        .order('zipf_frequency', { ascending: false });
}

export async function lookupVocabularyProfile(word) {
    const normalizedWord = normalizeVocabularyWord(word);
    const exactCandidates = getVocabularyExactCandidates(normalizedWord);
    if (!normalizedWord || exactCandidates.length === 0) {
        return buildVocabularyProfile(normalizedWord);
    }

    const [exactMembershipResult, exactFrequencyResult] = await Promise.all([
        queryMemberships(exactCandidates),
        queryFrequencies(exactCandidates),
    ]);

    let candidates = exactCandidates;
    let membershipResult = exactMembershipResult;
    let frequencyResult = exactFrequencyResult;
    let matchedByInflection = false;

    // A source may store an exact display form under a word-family headword
    // (for example, advisor under advise). Reuse the headword's corpus
    // frequency when the exact form has no frequency row, without treating the
    // exact source match as an inferred inflection.
    if (
        exactMembershipResult.data?.length
        && !exactFrequencyResult.data?.length
        && !exactFrequencyResult.error
    ) {
        const canonicalCandidates = [...new Set(
            exactMembershipResult.data
                .map(item => item.canonical_word)
                .filter(candidate => candidate && !exactCandidates.includes(candidate))
        )];
        if (canonicalCandidates.length > 0) {
            const canonicalFrequencyResult = await queryFrequencies(canonicalCandidates);
            frequencyResult = {
                data: mergeFrequencies(
                    exactFrequencyResult.data || [],
                    canonicalFrequencyResult.data || []
                ),
                error: canonicalFrequencyResult.error,
            };
        }
    }

    // Exact imported forms and aliases always win. Inflection guessing is only
    // attempted when the official index has no exact membership.
    if (!exactMembershipResult.data?.length && !exactMembershipResult.error) {
        const fallbackCandidates = getVocabularyLookupCandidates(normalizedWord)
            .filter(candidate => !exactCandidates.includes(candidate));
        if (fallbackCandidates.length > 0) {
            const [fallbackMembershipResult, fallbackFrequencyResult] = await Promise.all([
                queryMemberships(fallbackCandidates),
                queryFrequencies(fallbackCandidates),
            ]);
            if (fallbackMembershipResult.data?.length) {
                candidates = fallbackCandidates;
                membershipResult = fallbackMembershipResult;
                matchedByInflection = true;
                frequencyResult = {
                    data: mergeFrequencies(
                        exactFrequencyResult.data || [],
                        fallbackFrequencyResult.data || []
                    ),
                    error: exactFrequencyResult.error && fallbackFrequencyResult.error
                        ? fallbackFrequencyResult.error
                        : null,
                };
            }
        }
    }

    const memberships = mergeMemberships(membershipResult.data || [])
        .sort((a, b) => (
            (Number(a.source?.stage_rank) || 999) - (Number(b.source?.stage_rank) || 999)
            || (candidates.indexOf(a.word_form) === -1 ? 999 : candidates.indexOf(a.word_form))
            - (candidates.indexOf(b.word_form) === -1 ? 999 : candidates.indexOf(b.word_form))
        ));
    const unavailable = Boolean(
        membershipResult.error
        && frequencyResult.error
    );

    if (unavailable) {
        console.warn('Vocabulary index is unavailable. Run the latest Supabase migration and reference-data import.');
    }

    return buildVocabularyProfile(
        normalizedWord,
        memberships,
        frequencyResult.data || [],
        { unavailable, matchedByInflection }
    );
}
