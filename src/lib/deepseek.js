import { supabase } from './supabase';
import { isValidUsageExercise } from '../utils/usageExercise';

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

/**
 * Call the Supabase Edge Function to generate word content via DeepSeek API
 * The API key is securely stored on the server side.
 * @param {string} word - English word to generate content for
 * @returns {Promise<{meaning_cn: string, phonetic: string, example: string, usage_prompt_cn: string}>}
 */
export async function generateWordContent(word) {
    // Check daily limit (30 per day) - quick UI feedback
    const usage = checkDailyLimit('deepseek_gen', 30);
    if (usage.count >= usage.limit) {
        throw new Error('今日AI生成次数已用完（30/30），明天再试或手动填写');
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
 * @returns {Promise<{prompt_cn: string, reference_answer_en: string}>}
 */
export async function getUsageExercise(word, meaningCn) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('请先登录');

    const wordKey = normalizeWord(word);
    const meaningKey = meaningCn?.trim() || '';
    const exerciseContext = { word, meaningCn: meaningKey };

    const { data: cached, error: cacheError } = await supabase
        .from('user_usage_exercises')
        .select('prompt_cn, reference_answer_en')
        .eq('user_id', userId)
        .eq('word', wordKey)
        .eq('meaning_cn', meaningKey)
        .maybeSingle();

    if (cacheError) throw cacheError;
    if (isValidUsageExercise(cached, exerciseContext)) {
        return cached;
    }

    const { data: wordCached, error: wordCacheError } = await supabase
        .from('user_usage_exercises')
        .select('prompt_cn, reference_answer_en')
        .eq('user_id', userId)
        .eq('word', wordKey)
        .order('updated_at', { ascending: false })
        .limit(5);

    if (wordCacheError) throw wordCacheError;
    const reusableExercise = wordCached?.find(exercise => isValidUsageExercise(exercise, exerciseContext));
    if (reusableExercise) {
        return reusableExercise;
    }

    const usage = checkDailyLimit('deepseek_usage_gen', 200);
    if (usage.count >= usage.limit) {
        throw new Error('今日场景题生成次数已用完（200/200），明天再试');
    }

    const { data, error } = await supabase.functions.invoke('deepseek-proxy', {
        body: {
            action: 'generate_usage_exercise',
            word,
            meaning_cn: meaningKey,
        },
    });

    if (error) {
        throw new Error(error.message || '场景题生成失败，请稍后再试');
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    const exercise = {
        prompt_cn: data.prompt_cn || '',
        reference_answer_en: data.reference_answer_en || '',
    };

    if (!isValidUsageExercise(exercise, exerciseContext)) {
        throw new Error('场景题生成结果不符合要求，请重试');
    }

    await supabase.from('user_usage_exercises').upsert({
        user_id: userId,
        word: wordKey,
        meaning_cn: meaningKey,
        ...exercise,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,word,meaning_cn' });

    incrementDailyCount('deepseek_usage_gen');
    return exercise;
}

/**
 * Ask DeepSeek to grade a full-sentence usage answer.
 * @param {object} params
 * @returns {Promise<{passed: boolean, score: number, feedback_cn: string, corrected_answer_en: string}>}
 */
export async function gradeUsageAnswer(params) {
    const usage = checkDailyLimit('deepseek_usage_grade', 200);
    if (usage.count >= usage.limit) {
        throw new Error('今日场景题批改次数已用完（200/200），明天再试');
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

    return {
        passed: Boolean(data.passed),
        score: Number(data.score || 0),
        feedback_cn: data.feedback_cn || '',
        corrected_answer_en: data.corrected_answer_en || params.referenceAnswerEn,
    };
}
