import { supabase } from './supabase';

// Simple daily counter using localStorage (UI-level quick check; server also enforces limit)
function checkDailyLimit() {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem('deepseek_gen');
    let data = stored ? JSON.parse(stored) : { date: today, count: 0 };

    if (data.date !== today) {
        data = { date: today, count: 0 };
    }

    return data;
}

function incrementDailyCount() {
    const data = checkDailyLimit();
    data.count++;
    localStorage.setItem('deepseek_gen', JSON.stringify(data));
}

/**
 * Call the Supabase Edge Function to generate word content via DeepSeek API
 * The API key is securely stored on the server side.
 * @param {string} word - English word to generate content for
 * @returns {Promise<{meaning_cn: string, phonetic: string, example: string}>}
 */
export async function generateWordContent(word) {
    // Check daily limit (30 per day) - quick UI feedback
    const usage = checkDailyLimit();
    if (usage.count >= 30) {
        throw new Error('今日AI生成次数已用完（30/30），明天再试或手动填写');
    }

    try {
        const { data, error } = await supabase.functions.invoke('deepseek-proxy', {
            body: { word },
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
        incrementDailyCount();

        return {
            meaning_cn: data.meaning_cn || '未找到释义',
            phonetic: data.phonetic || '',
            example: data.example || '',
        };
    } catch (err) {
        if (err.message.includes('今日AI')) throw err;
        throw new Error('生成失败：' + err.message);
    }
}
