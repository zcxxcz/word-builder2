import { supabase } from './supabase';
import { upsertUsageExercise } from './usageExerciseCache';
import { AI_DAILY_LIMIT, USAGE_AI_DAILY_LIMIT, USAGE_QUESTION_DAILY_LIMIT } from '../utils/constants';
import { isEquivalentUsageAnswer } from '../utils/usageAnswer';
import { isValidUsageExercise } from '../utils/usageExercise';
import {
    chooseUsageExercise,
    findValidExerciseForVariant,
    getNextUsageVariantIndex,
    getTargetUsageVariantIndex,
    shouldAdvanceUsageVariant,
} from '../utils/usageVariant';

const USAGE_EXERCISE_GENERATION_ATTEMPTS = 3;

// Simple daily counter using localStorage (UI-level quick check; server also enforces limit)
function checkDailyLimit(key = 'deepseek_gen', limit = 30) {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(key);
    let data = stored ? JSON.parse(stored) : { date: today, count: 0 };

    if (data.date !== today) {
        data = { date: today, count: 0 };
    }

    return { ...data, limit };
}

function incrementDailyCount(key = 'deepseek_gen') {
    const data = checkDailyLimit(key);
    data.count++;
    localStorage.setItem(key, JSON.stringify({ date: data.date, count: data.count }));
}

function normalizeWord(word) {
    return word.trim().toLowerCase();
}

function isTrue(value) {
    return value === true || value === 'true';
}

/**
 * Call the Supabase Edge Function to generate word content via DeepSeek API
 * The API key is securely stored on the server side.
 * @param {string} word - English word to generate content for
 * @returns {Promise<{meaning_cn: string, phonetic: string, example: string, usage_prompt_cn: string, input_word: string, canonical_word: string, spelling_suspected: boolean}>}
 */
export async function generateWordContent(word) {
    // Check daily limit - quick UI feedback
    const usage = checkDailyLimit('deepseek_gen', AI_DAILY_LIMIT);
    if (usage.count >= usage.limit) {
        throw new Error(`今日AI生成次数已用完（${AI_DAILY_LIMIT}/${AI_DAILY_LIMIT}），明天再试或手动填写`);
    }

    try {
        const { data, error } = await supabase.functions.invoke('deepseek-proxy', {
            body: { action: 'generate_word_content', word },
        });

        if (error) {
            console.error('Edge Function error:', error);
            // Handle specific error messages from the Edge Function
            if (error.message) {
                throw new Error(error.message);
            }
            throw new Error('生成失败，请稍后再试');
        }

        if (data?.error) {
            throw new Error(data.error);
        }

        // Increment local daily counter
        incrementDailyCount('deepseek_gen');

        return {
            input_word: data.input_word || word,
            canonical_word: data.canonical_word || word,
            spelling_suspected: isTrue(data.spelling_suspected),
            meaning_cn: data.meaning_cn || '未找到释义',
            phonetic: data.phonetic || '',
            example: data.example || '',
            usage_prompt_cn: data.usage_prompt_cn || '',
        };
    } catch (err) {
        if (err.message.includes('今日AI')) throw err;
        throw new Error('生成失败：' + err.message);
    }
}

/**
 * Get a cached usage exercise, or generate and cache one via DeepSeek.
 * @param {string} word
 * @param {string} meaningCn
 * @param {string} usageSceneMode
 * @returns {Promise<{prompt_cn: string, reference_answer_en: string, variant_index: number}>}
 */
export async function getUsageExercise(word, meaningCn, usageSceneMode = 'rotate') {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('请先登录');

    const wordKey = normalizeWord(word);
    const meaningKey = meaningCn?.trim() || '';
    const exerciseContext = { word, meaningCn: meaningKey };
    const isValid = (exercise) => isValidUsageExercise(exercise, exerciseContext);

    const { data: state, error: stateError } = await supabase
        .from('user_word_state')
        .select('next_usage_variant_index')
        .eq('user_id', userId)
        .eq('word', wordKey)
        .maybeSingle();

    if (stateError) throw stateError;

    const targetVariantIndex = getTargetUsageVariantIndex(state?.next_usage_variant_index, usageSceneMode);
    const allowSceneFallback = shouldAdvanceUsageVariant(usageSceneMode);

    const { data: cached, error: cacheError } = await supabase
        .from('user_usage_exercises')
        .select('prompt_cn, reference_answer_en, variant_index')
        .eq('user_id', userId)
        .eq('word', wordKey)
        .eq('meaning_cn', meaningKey)
        .order('variant_index', { ascending: true });

    if (cacheError) throw cacheError;
    const exactChoice = allowSceneFallback
        ? chooseUsageExercise(cached || [], targetVariantIndex, isValid)
        : {
            exercise: findValidExerciseForVariant(cached || [], targetVariantIndex, isValid),
            usedFallback: false,
        };
    if (exactChoice.exercise && !exactChoice.usedFallback) {
        return exactChoice.exercise;
    }

    const { data: wordCached, error: wordCacheError } = await supabase
        .from('user_usage_exercises')
        .select('prompt_cn, reference_answer_en, variant_index')
        .eq('user_id', userId)
        .eq('word', wordKey)
        .order('updated_at', { ascending: false })
        .limit(10);

    if (wordCacheError) throw wordCacheError;
    const wordChoice = allowSceneFallback
        ? chooseUsageExercise(wordCached || [], targetVariantIndex, isValid)
        : {
            exercise: findValidExerciseForVariant(wordCached || [], targetVariantIndex, isValid),
            usedFallback: false,
        };
    if (wordChoice.exercise && !wordChoice.usedFallback) {
        return wordChoice.exercise;
    }

    const fallbackVariantIndex = getNextUsageVariantIndex(targetVariantIndex);
    const fallbackExercise = allowSceneFallback
        ? exactChoice.exercise ||
            wordChoice.exercise ||
            findValidExerciseForVariant([...(cached || []), ...(wordCached || [])], fallbackVariantIndex, isValid)
        : null;

    let lastInvalidExercise = null;

    for (let attempt = 1; attempt <= USAGE_EXERCISE_GENERATION_ATTEMPTS; attempt++) {
        const usage = checkDailyLimit('deepseek_usage_gen', USAGE_AI_DAILY_LIMIT);
        if (usage.count >= usage.limit) {
            if (fallbackExercise) return fallbackExercise;
            throw new Error(`今日场景题生成次数已用完（${USAGE_AI_DAILY_LIMIT}/${USAGE_AI_DAILY_LIMIT}），明天再试`);
        }

        let data;
        try {
            const response = await supabase.functions.invoke('deepseek-proxy', {
                body: {
                    action: 'generate_usage_exercise',
                    word,
                    meaning_cn: meaningKey,
                    variant_index: targetVariantIndex,
                    existing_prompt_cn: fallbackExercise?.prompt_cn || '',
                    existing_reference_answer_en: fallbackExercise?.reference_answer_en || '',
                    retry_attempt: attempt,
                    previous_invalid_prompt_cn: lastInvalidExercise?.prompt_cn || '',
                    previous_invalid_reference_answer_en: lastInvalidExercise?.reference_answer_en || '',
                },
            });

            if (response.error) {
                throw new Error(response.error.message || '场景题生成失败，请稍后再试');
            }

            data = response.data;
            if (data?.error) {
                throw new Error(data.error);
            }
            incrementDailyCount('deepseek_usage_gen');
        } catch (err) {
            if (fallbackExercise) return fallbackExercise;
            throw err;
        }

        const exercise = {
            prompt_cn: data.prompt_cn || '',
            reference_answer_en: data.reference_answer_en || '',
            variant_index: targetVariantIndex,
        };

        if (!isValidUsageExercise(exercise, exerciseContext)) {
            lastInvalidExercise = exercise;
            continue;
        }

        await upsertUsageExercise({
            userId,
            word: wordKey,
            meaningCn: meaningKey,
            ...exercise,
        });

        return exercise;
    }

    if (fallbackExercise) return fallbackExercise;
    throw new Error('场景题暂时没准备好，请稍后重试或暂时跳过');
}

/**
 * Ask DeepSeek to grade a full-sentence usage answer.
 * @param {object} params
 * @returns {Promise<{passed: boolean, score: number, feedback_cn: string, corrected_answer_en: string}>}
 */
export async function gradeUsageAnswer(params) {
    const usage = checkDailyLimit('deepseek_usage_grade', USAGE_AI_DAILY_LIMIT);
    if (usage.count >= usage.limit) {
        throw new Error(`今日场景题批改次数已用完（${USAGE_AI_DAILY_LIMIT}/${USAGE_AI_DAILY_LIMIT}），明天再试`);
    }

    const { data, error } = await supabase.functions.invoke('deepseek-proxy', {
        body: {
            action: 'grade_usage_answer',
            word: params.word,
            meaning_cn: params.meaningCn || '',
            prompt_cn: params.promptCn,
            reference_answer_en: params.referenceAnswerEn,
            answer_en: params.answerEn,
        },
    });

    if (error) {
        throw new Error(error.message || '批改失败，请稍后再试');
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    incrementDailyCount('deepseek_usage_grade');

    const correctedAnswer = data.corrected_answer_en || params.referenceAnswerEn;
    const isExactMatch = isEquivalentUsageAnswer(params.answerEn, [
        params.referenceAnswerEn,
        correctedAnswer,
    ]);

    return {
        passed: isExactMatch ? true : Boolean(data.passed),
        score: isExactMatch ? 1 : Number(data.score || 0),
        feedback_cn: data.feedback_cn || '',
        corrected_answer_en: correctedAnswer,
    };
}

/**
 * Ask DeepSeek to explain a usage grading question.
 * @param {object} params
 * @returns {Promise<{answer_cn: string}>}
 */
export async function askUsageQuestion(params) {
    const usage = checkDailyLimit('deepseek_usage_question', USAGE_QUESTION_DAILY_LIMIT);
    if (usage.count >= usage.limit) {
        throw new Error(`今日场景题追问次数已用完（${USAGE_QUESTION_DAILY_LIMIT}/${USAGE_QUESTION_DAILY_LIMIT}），明天再试`);
    }

    const { data, error } = await supabase.functions.invoke('deepseek-proxy', {
        body: {
            action: 'explain_usage_question',
            word: params.word,
            meaning_cn: params.meaningCn || '',
            prompt_cn: params.promptCn,
            reference_answer_en: params.referenceAnswerEn,
            answer_en: params.answerEn,
            feedback_cn: params.feedbackCn || '',
            corrected_answer_en: params.correctedAnswerEn || '',
            question_cn: params.questionCn,
        },
    });

    if (error) {
        throw new Error(error.message || '追问失败，请稍后再试');
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    incrementDailyCount('deepseek_usage_question');

    return {
        answer_cn: data.answer_cn || '这道题暂时没有解释，请稍后再问一次。',
    };
}
