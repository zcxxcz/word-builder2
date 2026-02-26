const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;

// Simple daily counter using localStorage
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
 * Call the DeepSeek API directly to generate word content
 * @param {string} word - English word to generate content for
 * @returns {Promise<{meaning_cn: string, phonetic: string, example: string}>}
 */
export async function generateWordContent(word) {
    // Check daily limit (30 per day)
    const usage = checkDailyLimit();
    if (usage.count >= 30) {
        throw new Error('今日AI生成次数已用完（30/30），明天再试或手动填写');
    }

    if (!DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek API Key 未配置');
    }

    const prompt = `你是一个面向中国初一学生（12-13岁）的英语词典助手。请为英文单词 "${word}" 生成以下信息，严格使用JSON格式输出：

{
  "meaning_cn": "中文释义（每条≤12个汉字，最多3条义项，用;分隔，避免生僻和学术表达）",
  "phonetic": "国际音标（IPA格式，如 /ˈæp.əl/）",
  "example": "1-2个例句（句长6-12个词，不使用复杂从句，必须包含目标词原形）"
}

注意：
- 中文释义要简短、常用、适合初中生
- 例句要贴近初中生日常生活
- 只输出JSON，不要其他内容`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('DeepSeek API error:', errText);
            throw new Error('生成失败，请稍后再试');
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || '';

        // Parse JSON from response
        let parsed;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch {
            parsed = {
                meaning_cn: '未找到释义',
                phonetic: '',
                example: '',
            };
        }

        // Increment daily counter
        incrementDailyCount();

        return parsed;
    } catch (err) {
        if (err.message.includes('今日AI')) throw err;
        throw new Error('生成失败：' + err.message);
    }
}
