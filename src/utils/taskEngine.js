import { supabase } from '../lib/supabase';
import { getToday, shuffle } from './srs';

/**
 * Generate the daily study task queue.
 *
 * Order: Review (due) → New words → (Relapse collected during session)
 *
 * @param {object} settings - { daily_new, review_cap, relapse_cap }
 * @param {string} userId
 * @returns {Promise<{ reviewWords: Array, newWords: Array }>}
 */
export async function generateDailyQueue(settings, userId) {
    const today = getToday();
    const { daily_new = 10, review_cap = 40 } = settings;

    // 1. Due reviews: words with next_review_at <= today
    const { data: reviewStates, error: reviewErr } = await supabase
        .from('user_word_state')
        .select('*')
        .eq('user_id', userId)
        .lte('next_review_at', today)
        .order('next_review_at', { ascending: true })
        .limit(review_cap);

    if (reviewErr) throw reviewErr;

    // Get full word info for review words
    const reviewWords = await enrichWordsFromState(reviewStates || []);

    // 2. New words: words the user has never studied
    // Get all words the user has already studied
    const { data: allStates, error: stateErr } = await supabase
        .from('user_word_state')
        .select('word')
        .eq('user_id', userId);

    if (stateErr) throw stateErr;

    const studiedWords = new Set((allStates || []).map(s => s.word.toLowerCase()));

    // Get built-in words not yet studied
    const { data: allBuiltIn, error: builtInErr } = await supabase
        .from('built_in_words')
        .select('*')
        .order('id', { ascending: true });

    if (builtInErr) throw builtInErr;

    // Also get custom words
    const { data: allCustom, error: customErr } = await supabase
        .from('custom_words')
        .select('*')
        .eq('user_id', userId);

    if (customErr) throw customErr;

    // Combine and deduplicate by word text
    const allWords = [...(allBuiltIn || []), ...(allCustom || [])];
    const seen = new Set();
    const unseenWords = [];

    for (const w of allWords) {
        const key = w.word.toLowerCase();
        if (!studiedWords.has(key) && !seen.has(key)) {
            seen.add(key);
            unseenWords.push(w);
        }
    }

    const newWords = unseenWords.slice(0, daily_new);

    return {
        reviewWords: shuffle(reviewWords),
        newWords, // new words keep order for learning, shuffle happens in review phase
    };
}

/**
 * Enrich word state records with full word data (meaning, phonetic, example)
 */
async function enrichWordsFromState(states) {
    if (states.length === 0) return [];

    const words = states.map(s => s.word);

    // Try built-in words first
    const { data: builtIn } = await supabase
        .from('built_in_words')
        .select('*')
        .in('word', words);

    // Also check custom words
    const { data: custom } = await supabase
        .from('custom_words')
        .select('*');

    const wordMap = {};

    // Built-in words (may have duplicates, take first)
    for (const w of (builtIn || [])) {
        const key = w.word.toLowerCase();
        if (!wordMap[key]) {
            wordMap[key] = w;
        } else {
            // Collect all meanings for random selection
            if (!wordMap[key].all_meanings) {
                wordMap[key].all_meanings = [wordMap[key].meaning_cn];
            }
            if (!wordMap[key].all_meanings.includes(w.meaning_cn)) {
                wordMap[key].all_meanings.push(w.meaning_cn);
            }
        }
    }

    // Custom words
    for (const w of (custom || [])) {
        const key = w.word.toLowerCase();
        if (!wordMap[key]) {
            wordMap[key] = w;
        }
    }

    return states.map(state => {
        const wordData = wordMap[state.word.toLowerCase()] || {};
        return {
            ...wordData,
            ...state,
            meaning_cn: wordData.meaning_cn || state.word,
            all_meanings: wordData.all_meanings || [wordData.meaning_cn || state.word],
        };
    });
}

/**
 * Get count of due reviews and available new words
 */
export async function getTaskCounts(settings, userId) {
    const today = getToday();
    const { daily_new = 10, review_cap = 40 } = settings;

    // Count due reviews
    const { count: reviewCount, error: reviewErr } = await supabase
        .from('user_word_state')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lte('next_review_at', today);

    if (reviewErr) throw reviewErr;

    // Count studied words
    const { count: studiedCount, error: stateErr } = await supabase
        .from('user_word_state')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (stateErr) throw stateErr;

    // Count total available words
    const { count: totalBuiltIn, error: builtInErr } = await supabase
        .from('built_in_words')
        .select('*', { count: 'exact', head: true });

    if (builtInErr) throw builtInErr;

    const { count: totalCustom, error: customErr } = await supabase
        .from('custom_words')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    if (customErr) throw customErr;

    const totalWords = (totalBuiltIn || 0) + (totalCustom || 0);
    const availableNew = Math.max(0, totalWords - (studiedCount || 0));

    return {
        reviewCount: Math.min(reviewCount || 0, review_cap),
        newCount: Math.min(availableNew, daily_new),
        totalStudied: studiedCount || 0,
        totalWords,
    };
}
