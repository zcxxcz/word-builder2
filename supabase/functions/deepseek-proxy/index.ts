// DeepSeek API Proxy Edge Function
// Deploy to Supabase Edge Functions
// Environment variables needed: SUPABASE_URL, SUPABASE_ANON_KEY, DEEPSEEK_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const WORD_CONTENT_DAILY_LIMIT = 30;
const USAGE_EXERCISE_DAILY_LIMIT = 200;
const USAGE_GRADE_DAILY_LIMIT = 200;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function extractJson(content: string, fallback: Record<string, unknown>) {
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        return JSON.parse(jsonMatch[0]);
    } catch {
        return fallback;
    }
}

async function callDeepSeek(deepseekKey: string, prompt: string, maxTokens = 300) {
    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('DeepSeek API error:', errText);
        throw new Error('生成失败，请稍后再试');
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
}

function getLimitConfig(action: string) {
    if (action === 'generate_usage_exercise') {
        return {
            limit: USAGE_EXERCISE_DAILY_LIMIT,
            countField: 'daily_usage_gen_count',
            dateField: 'last_usage_gen_date',
            error: '今日场景题生成次数已用完（200/200），明天再试',
        };
    }

    if (action === 'grade_usage_answer') {
        return {
            limit: USAGE_GRADE_DAILY_LIMIT,
            countField: 'daily_usage_grade_count',
            dateField: 'last_usage_grade_date',
            error: '今日场景题批改次数已用完（200/200），明天再试',
        };
    }

    return {
        limit: WORD_CONTENT_DAILY_LIMIT,
        countField: 'daily_gen_count',
        dateField: 'last_gen_date',
        error: '今日AI生成次数已用完（30/30），明天再试或手动填写',
    };
}

function getStudyDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('zh-CN-u-nu-latn', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

async function recordAnalyticsEvent(
    supabase: any,
    userId: string,
    eventName: string,
    metadata: Record<string, unknown>,
) {
    try {
        await supabase.from('analytics_events').insert({
            user_id: userId,
            event_name: eventName,
            event_date: getStudyDate(),
            metadata,
        });
    } catch (error) {
        console.warn('Analytics event skipped:', error);
    }
}

Deno.serve(async (req) => {
    let analyticsClient: any = null;
    let analyticsUserId = '';
    let analyticsAction = 'unknown';

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: '未授权' }, 401);
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return jsonResponse({ error: '认证失败' }, 401);
        }

        analyticsClient = supabase;
        analyticsUserId = user.id;

        const body = await req.json();
        const action = body.action || 'generate_word_content';
        analyticsAction = String(action);
        const { word } = body;

        if (!word || typeof word !== 'string') {
            await recordAnalyticsEvent(supabase, user.id, 'ai_call', {
                action: analyticsAction,
                status: 'error',
                reason: 'validation',
            });
            return jsonResponse({ error: '请提供英文单词' }, 400);
        }

        const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
        if (!deepseekKey) {
            await recordAnalyticsEvent(supabase, user.id, 'ai_call', {
                action: analyticsAction,
                status: 'error',
                reason: 'missing_api_key',
            });
            return jsonResponse({ error: 'API key not configured' }, 500);
        }

        const today = new Date().toISOString().split('T')[0];
        const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        const limitConfig = getLimitConfig(action);
        const currentCount = settings?.[limitConfig.dateField] === today
            ? settings?.[limitConfig.countField] || 0
            : 0;

        if (currentCount >= limitConfig.limit) {
            await recordAnalyticsEvent(supabase, user.id, 'ai_call', {
                action: analyticsAction,
                status: 'limit',
            });
            return jsonResponse({ error: limitConfig.error }, 429);
        }

        let parsed: Record<string, unknown>;

        if (action === 'generate_usage_exercise') {
            const meaningCn = String(body.meaning_cn || '').trim();
            const prompt = `你是一个面向中国初一学生（12-13岁）的英语老师。请为英文单词或短语 "${word}" 生成一个真实使用场景翻译题，严格使用JSON格式输出：

{
  "prompt_cn": "中文句子。必须贴近初中生日常、家庭、校园或常见生活场景，句子自然完整，不出现英文目标词。",
  "reference_answer_en": "英文参考答案。必须自然使用目标词或短语，允许根据语境使用正确时态、单复数或词形变化。"
}

已知中文释义：${meaningCn || '无'}

要求：
- 中文句子长度 10-28 个汉字，适合初一学生理解
- 英文参考答案 6-14 个词，不使用复杂从句
- 参考答案必须使用目标词/短语或其合理变形
- 只输出JSON，不要其他内容`;

            const content = await callDeepSeek(deepseekKey, prompt, 360);
            parsed = extractJson(content, {
                prompt_cn: '',
                reference_answer_en: '',
            });
        } else if (action === 'grade_usage_answer') {
            const meaningCn = String(body.meaning_cn || '').trim();
            const promptCn = String(body.prompt_cn || '').trim();
            const referenceAnswer = String(body.reference_answer_en || '').trim();
            const answerEn = String(body.answer_en || '').trim();

            if (!promptCn || !referenceAnswer || !answerEn) {
                return jsonResponse({ error: '请提供场景题、参考答案和学生答案' }, 400);
            }

            const prompt = `你是一个严格但鼓励学生的初一英语老师。请批改学生用目标词完成中文场景句英译的答案，严格使用JSON格式输出：

目标词或短语：${word}
中文释义：${meaningCn || '无'}
中文场景句：${promptCn}
参考答案：${referenceAnswer}
学生答案：${answerEn}

请判断学生答案是否：
1. 基本表达了中文句子的核心意思；
2. 正确使用了目标词/短语，允许必要的时态、单复数、第三人称、过去式、现在分词等合理变形；
3. 语法错误不影响理解时可以通过，但目标词用法错误不能通过。

{
  "passed": true,
  "score": 0.0,
  "feedback_cn": "一句中文反馈，指出是否用对目标词和最重要的问题",
  "corrected_answer_en": "更自然或修正后的英文答案"
}

score 为 0-1 的数字；passed 只有在 score >= 0.7 且目标词用法正确时为 true。
只输出JSON，不要其他内容`;

            const content = await callDeepSeek(deepseekKey, prompt, 420);
            parsed = extractJson(content, {
                passed: false,
                score: 0,
                feedback_cn: '没有得到有效批改，请重试',
                corrected_answer_en: referenceAnswer,
            });
        } else {
            const prompt = `你是一个面向中国初一学生（12-13岁）的英语词典助手。请为英文单词 "${word}" 生成以下信息，严格使用JSON格式输出：

{
  "meaning_cn": "中文释义（每条≤12个汉字，最多3条义项，用;分隔，避免生僻和学术表达）",
  "phonetic": "国际音标（IPA格式，如 /ˈæp.əl/）",
  "example": "1个英文例句（句长6-12个词，不使用复杂从句，必须包含目标词原形）",
  "usage_prompt_cn": "上面英文例句对应的中文翻译，不出现英文目标词，适合作为请翻译题"
}

注意：
- 中文释义要简短、常用、适合初中生
- 例句要贴近初中生日常生活
- usage_prompt_cn 必须和 example 语义一致
- 只输出JSON，不要其他内容`;

            const content = await callDeepSeek(deepseekKey, prompt, 520);
            parsed = extractJson(content, {
                meaning_cn: '未找到释义',
                phonetic: '',
                example: '',
                usage_prompt_cn: '',
            });
        }

        await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                [limitConfig.countField]: currentCount + 1,
                [limitConfig.dateField]: today,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        await recordAnalyticsEvent(supabase, user.id, 'ai_call', {
            action: analyticsAction,
            status: 'success',
        });

        return jsonResponse(parsed);
    } catch (error) {
        if (analyticsClient && analyticsUserId) {
            await recordAnalyticsEvent(analyticsClient, analyticsUserId, 'ai_call', {
                action: analyticsAction,
                status: 'error',
                reason: 'service_error',
            });
        }

        console.error('Edge function error:', error);
        const message = error instanceof Error ? error.message : '服务器错误';
        return jsonResponse({ error: message || '服务器错误' }, 500);
    }
});
