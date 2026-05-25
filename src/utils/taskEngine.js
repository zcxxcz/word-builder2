import { supabase } from '../lib/supabase';
import { REVIEW_BATCH_LIMIT } from './constants';
import { getToday, shuffle } from './srs';

const normalizeWord = (word) => (word || '').trim().toLowerCase();

const getEffectiveReviewCap = (settings = {}) => (
    Math.min(settings.review_cap ?? REVIEW_BATCH_LIMIT, REVIEW_BATCH_LIMIT)
);

const getDailyNewLimit = (settings = {}) => settings.daily_new ?? 10;

async function getStudiedWordSet(userId) {
    const { data, error } = await supabase
        .from('user_word_state')
        .select('word')
        .eq('user_id', userId);

    if (error) throw error;

    return new Set((data || []).map(s => normalizeWord(s.word)));
}

async function fetchWordsBySelection(selection, userId) {
    if (!selection || !['builtin', 'custom'].includes(selection.source)) {
        throw new Error('请选择要新学的词表');
    }

    const isBuiltIn = selection.source === 'builtin';
    const table = isBuiltIn ? 'built_in_words' : 'custom_words';
    let query = supabase.from(table).select('*');

    if (!isBuiltIn) {
        query = query.eq('user_id', userId);
    }

    const ids = (selection.ids || []).filter(Boolean);
    if (ids.length > 0) {
        query = query.in('id', ids);
    } else if (selection.listId) {
        query = query.eq('wordlist_id', selection.listId).order('id', { ascending: true });
    } else {
        throw new Error('请选择要新学的词表');
    }

    const { data, error } = await query;
    if (error) throw error;

    let words = data || [];
    if (selection.unit) {
        words = words.filter(w => (w.unit || '未分组') === selection.unit);
    }

    if (ids.length > 0) {
        const order = new Map(ids.map((id, index) => [id, index]));
        words = [...words].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    return words;
}

function takeUnstudiedUniqueWords(words, studiedWords, limit = Infinity) {
    const seen = new Set();
    const result = [];

    for (const word of words) {
        const key = normalizeWord(word.word);
        if (!key || studiedWords.has(key) || seen.has(key)) continue;

        seen.add(key);
        result.push(word);
        if (result.length >= limit) break;
    }

    return result;
}

/**
 * Generate one review batch. review_cap limits this session only; due words not
 * included here remain due because their next_review_at is unchanged.
 */
export async function generateReviewQueue(settings, userId) {
    const today = getToday();
    const effectiveReviewCap = getEffectiveReviewCap(settings);

    const { data: reviewStates, error: reviewErr } = await supabase
        .from('user_word_state')
        .select('*')
        .eq('user_id', userId)
        .lte('next_review_at', today)
        .order('next_review_at', { ascending: true })
        .limit(effectiveReviewCap);

    if (reviewErr) throw reviewErr;

    const reviewWords = await enrichWordsFromState(reviewStates || [], userId);
    return { reviewWords: shuffle(reviewWords) };
}

/**
 * Generate a new-learning queue from a user selection in the wordlist page.
 */
export async function generateNewLearningQueue(settings, userId, selection) {
    const dailyNewLimit = getDailyNewLimit(settings);
    const studiedWords = await getStudiedWordSet(userId);
    const candidateWords = await fetchWordsBySelection(selection, userId);
    const newWords = takeUnstudiedUniqueWords(candidateWords, studiedWords, dailyNewLimit);

    return { newWords };
}

/**
 * Backward-compatible wrapper for older callers. New UI should use
 * generateReviewQueue and generateNewLearningQueue separately.
 */
export async function generateDailyQueue(settings, userId) {
    const { reviewWords } = await generateReviewQueue(settings, userId);
    return { reviewWords, newWords: [] };
}

/**
 * Enrich word state records with full word data (meaning, phonetic, example)
 */
async function enrichWordsFromState(states, userId) {
    if (states.length === 0) return [];

    const words = states.map(s => s.word);

    const { data: builtIn } = await supabase
        .from('built_in_words')
        .select('*')
        .in('word', words);

    let customQuery = supabase
        .from('custom_words')
        .select('*');

    if (userId) {
        customQuery = customQuery.eq('user_id', userId);
    }

    const { data: custom } = await customQuery;
    const wordMap = {};

    for (const w of (builtIn || [])) {
        const key = normalizeWord(w.word);
        if (!wordMap[key]) {
            wordMap[key] = w;
        } else {
            if (!wordMap[key].all_meanings) {
                wordMap[key].all_meanings = [wordMap[key].meaning_cn];
            }
            if (!wordMap[key].all_meanings.includes(w.meaning_cn)) {
                wordMap[key].all_meanings.push(w.meaning_cn);
            }
        }
    }

    for (const w of (custom || [])) {
        const key = normalizeWord(w.word);
        if (!wordMap[key]) {
            wordMap[key] = w;
        }
    }

    return states.map(state => {
        const wordData = wordMap[normalizeWord(state.word)] || {};
        return {
            ...wordData,
            ...state,
            meaning_cn: wordData.meaning_cn || state.word,
            all_meanings: wordData.all_meanings || [wordData.meaning_cn || state.word],
        };
    });
}

/**
 * Get counts for the Today page.
 */
export async function getTaskCounts(settings, userId) {
    const today = getToday();
    const effectiveReviewCap = getEffectiveReviewCap(settings);

    const { count: reviewCount, error: reviewErr } = await supabase
        .from('user_word_state')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lte('next_review_at', today);

    if (reviewErr) throw reviewErr;

    const studiedWords = await getStudiedWordSet(userId);

    const { data: builtInWords, error: builtInErr } = await supabase
        .from('built_in_words')
        .select('word');

    if (builtInErr) throw builtInErr;

    const { data: customWords, error: customErr } = await supabase
        .from('custom_words')
        .select('word')
        .eq('user_id', userId);

    if (customErr) throw customErr;

    const allWordKeys = new Set();
    for (const word of [...(builtInWords || []), ...(customWords || [])]) {
        const key = normalizeWord(word.word);
        if (key) allWordKeys.add(key);
    }

    let availableNew = 0;
    for (const word of allWordKeys) {
        if (!studiedWords.has(word)) availableNew++;
    }

    const dueCount = reviewCount || 0;

    return {
        reviewCount: dueCount,
        reviewBatchCount: Math.min(dueCount, effectiveReviewCap),
        newCount: availableNew,
        totalStudied: studiedWords.size,
        totalWords: allWordKeys.size,
    };
}
