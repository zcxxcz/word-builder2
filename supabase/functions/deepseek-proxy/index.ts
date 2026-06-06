// DeepSeek API Proxy Edge Function
// Deploy to Supabase Edge Functions
// Environment variables needed: SUPABASE_URL, SUPABASE_ANON_KEY, DEEPSEEK_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const WORD_CONTENT_DAILY_LIMIT = 100;
const USAGE_EXERCISE_DAILY_LIMIT = 500;
const USAGE_GRADE_DAILY_LIMIT = 500;
const USAGE_QUESTION_DAILY_LIMIT = 200;

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
            model: 'deepseek-v4-flash',
            messages: [{ role: 'user', content: prompt }],
            thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
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
            error: `今日场景题生成次数已用完（${USAGE_EXERCISE_DAILY_LIMIT}/${USAGE_EXERCISE_DAILY_LIMIT}），明天再试`,
        };
    }

    if (action === 'grade_usage_answer') {
        return {
            limit: USAGE_GRADE_DAILY_LIMIT,
            countField: 'daily_usage_grade_count',
            dateField: 'last_usage_grade_date',
            error: `今日场景题批改次数已用完（${USAGE_GRADE_DAILY_LIMIT}/${USAGE_GRADE_DAILY_LIMIT}），明天再试`,
        };
    }

    if (action === 'explain_usage_question') {
        return {
            limit: USAGE_QUESTION_DAILY_LIMIT,
            countField: 'daily_usage_question_count',
            dateField: 'last_usage_question_date',
            error: `今日场景题追问次数已用完（${USAGE_QUESTION_DAILY_LIMIT}/${USAGE_QUESTION_DAILY_LIMIT}），明天再试`,
        };
    }

    return {
        limit: WORD_CONTENT_DAILY_LIMIT,
        countField: 'daily_gen_count',
        dateField: 'last_gen_date',
        error: `今日AI生成次数已用完（${WORD_CONTENT_DAILY_LIMIT}/${WORD_CONTENT_DAILY_LIMIT}），明天再试或手动填写`,
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
            const variantIndex = Number(body.variant_index) === 1 ? 1 : 0;
            const existingPromptCn = String(body.existing_prompt_cn || '').trim();
            const existingReferenceAnswer = String(body.existing_reference_answer_en || '').trim();
            const retryAttempt = Number(body.retry_attempt || 1);
            const previousInvalidPromptCn = String(body.previous_invalid_prompt_cn || '').trim();
            const previousInvalidReferenceAnswer = String(body.previous_invalid_reference_answer_en || '').trim();
            const diversityHint = existingPromptCn
                ? `\n已有另一个场景题：${existingPromptCn}\n已有英文参考答案：${existingReferenceAnswer || '无'}\n这次生成场景 ${variantIndex === 0 ? 'A' : 'B'}，必须和已有场景在语境、句式或语法点上明显不同。如果已有题偏学校/课堂/作业，这次优先换成生活场景；如果已有题偏生活，这次可以使用学校或其他不同生活场景。`
                : `\n这次生成场景 ${variantIndex === 0 ? 'A' : 'B'}。`;
            const retryHint = retryAttempt > 1
                ? `\n这是第 ${retryAttempt} 次重新生成。上一次结果未通过前端校验：\n上次中文题面：${previousInvalidPromptCn || '空'}\n上次英文参考答案：${previousInvalidReferenceAnswer || '空'}\n请修正：中文题面必须是纯中文真实场景句，明确包含目标词中文含义或清楚语义；英文参考答案必须自然使用目标词/短语或合理变形。不要输出元指令、不要暴露英文目标词、不要用占位词遮住目标含义。`
                : '';
            const prompt = `你是一个面向中国初一学生（12-13岁）的英语老师。请为英文单词或短语 "${word}" 生成一个真实使用场景英译题，严格使用JSON格式输出：

{
  "prompt_cn": "中文题面。必须贴近初中生日常真实语境，句子自然完整，可以是陈述句或自然问句，不出现英文目标词。",
  "reference_answer_en": "英文参考答案。必须自然使用目标词或短语，允许根据语境使用正确时态、单复数或词形变化。"
}

已知中文释义：${meaningCn || '无'}
${diversityHint}
${retryHint}

要求：
- 中文句子长度 10-28 个汉字，适合初一学生理解
- 生活场景和学校场景都可以使用，但不要长期偏向学校；请在家庭、朋友、课堂、校园活动、运动、出行、购物、餐厅、天气、兴趣、节日、社区、数字生活等场景之间自然分布
- 中文题面必须直接写出目标词的中文含义或清楚语义，不要让学生猜目标词
- 禁止用“什么、哪个、某个、东西、事物”等占位词替代目标词含义
- 允许自然问句，例如 name：你叫什么名字？
- 坏例（insight）：她的什么帮助我们解决了这个问题？
- 好例（insight）：她的洞察力帮助我们解决了这个问题。
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

            const prompt = `你是一个严格但鼓励学生的初一英语老师。这个练习的主要目标是判断学生能否把目标词迁移到真实句子里使用，不是严格整句翻译考试。请批改学生用目标词完成中文场景句英译的答案，严格使用JSON格式输出：

目标词或短语：${word}
中文释义：${meaningCn || '无'}
中文场景句：${promptCn}
参考答案：${referenceAnswer}
学生答案：${answerEn}

请按“目标词优先”的口径判断：
1. 如果学生正确使用了目标词/短语或其合理变形，并且中文场景的核心意思大致可理解，即使有冠词、介词、搭配、词序或非目标词相关的小语法错误，也应 passed=true；
2. 如果目标词缺失、目标词含义/词性/搭配明显用错、答案和中文场景明显无关，或英文碎片严重到不可理解，应 passed=false；
3. 非目标词相关的小问题只在 feedback_cn 和 corrected_answer_en 里温和指出，不要因此判失败或让学生回流；
4. 目标词正确但表达粗糙时 score 给 0.75-0.85；目标词正确且句子自然时给 0.9 以上；目标词错误通常低于 0.7。
5. corrected_answer_en 必须和 feedback_cn 完全自洽：如果 feedback_cn 指出某个搭配、词形、介词、句式或表达不自然/不准确，corrected_answer_en 必须同步修正这个问题，不允许继续保留被指出的问题表达。
6. 如果学生答案本身自然正确，corrected_answer_en 可以等于学生答案；如果参考答案也有不自然之处，请给出更自然写法，不要盲目复用参考答案。

{
  "passed": true,
  "score": 0.0,
  "feedback_cn": "一句中文反馈，指出是否用对目标词和最重要的问题",
  "corrected_answer_en": "更自然或修正后的英文答案"
}

score 为 0-1 的数字；passed 主要由目标词是否用对和核心场景是否可理解决定。
只输出JSON，不要其他内容`;

            const content = await callDeepSeek(deepseekKey, prompt, 420);
            parsed = extractJson(content, {
                passed: false,
                score: 0,
                feedback_cn: '没有得到有效批改，请重试',
                corrected_answer_en: referenceAnswer,
            });
        } else if (action === 'explain_usage_question') {
            const meaningCn = String(body.meaning_cn || '').trim();
            const promptCn = String(body.prompt_cn || '').trim();
            const referenceAnswer = String(body.reference_answer_en || '').trim();
            const answerEn = String(body.answer_en || '').trim();
            const feedbackCn = String(body.feedback_cn || '').trim();
            const correctedAnswer = String(body.corrected_answer_en || '').trim();
            const questionCn = String(body.question_cn || '').trim();

            if (!promptCn || !answerEn || !questionCn) {
                return jsonResponse({ error: '请提供题目、学生答案和问题' }, 400);
            }

            const prompt = `你是一个耐心、准确的初一英语老师。学生刚完成一道场景应用题，现在对批改结果有疑问。请基于题目上下文回答学生问题，严格使用JSON格式输出：

目标词或短语：${word}
中文释义：${meaningCn || '无'}
中文场景句：${promptCn}
参考答案：${referenceAnswer || '无'}
学生答案：${answerEn}
批改反馈：${feedbackCn || '无'}
建议答案：${correctedAnswer || referenceAnswer || '无'}
学生问题：${questionCn}

回答要求：
- 用中文解释，适合中国初一学生理解
- 直接回答学生的问题，重点讲目标词在这个句子里的正确含义、搭配或句式
- 如果学生混淆了某个义项，要说明“这个词可以有这个意思，但在这个句子里应该怎样用”
- 如果参考答案或建议答案也不够自然，要指出并给出更自然写法
- 不要改变原判分，不要鼓励死记唯一答案

{
  "answer_cn": "2-5句话中文解释，必要时包含1个更自然英文例句"
}

只输出JSON，不要其他内容`;

            const content = await callDeepSeek(deepseekKey, prompt, 560);
            parsed = extractJson(content, {
                answer_cn: '这道题暂时没有解释，请稍后再问一次。',
            });
        } else {
            const prompt = `你是一个面向中国初一学生（12-13岁）的英语词典助手。请为英文单词 "${word}" 生成以下信息，严格使用JSON格式输出：

{
  "input_word": "${word}",
  "canonical_word": "如果输入无明显拼写错误，填原词；如果高度确定是拼写错误，填建议的标准拼写",
  "spelling_suspected": false,
  "meaning_cn": "中文释义（每条≤12个汉字，最多3条义项，用;分隔，避免生僻和学术表达）",
  "phonetic": "国际音标（IPA格式，如 /ˈæp.əl/）",
  "example": "1个英文例句（句长6-12个词，不使用复杂从句，必须包含目标词原形）",
  "usage_prompt_cn": "上面英文例句对应的中文场景题面，不出现英文目标词，必须直接写出目标词的中文含义或清楚语义，适合作为请翻译题"
}

注意：
- 中文释义要简短、常用、适合初中生
- 例句要贴近初中生日常生活
- 只有在高度确定输入是拼写错误时，spelling_suspected 才返回 true；不确定、专有名词、短语、英美拼写差异、词形变化都返回 false
- 如果 spelling_suspected 为 true，meaning_cn、phonetic、example、usage_prompt_cn 都按 canonical_word 生成；不要静默把 input_word 当成正确词
- usage_prompt_cn 必须和 example 语义一致
- usage_prompt_cn 可以是陈述句或自然问句，但不能用“什么、哪个、某个、东西、事物”等占位词替代目标词含义
- 坏例（insight）：她的什么帮助我们解决了这个问题？
- 好例（insight）：她的洞察力帮助我们解决了这个问题。
- 只输出JSON，不要其他内容`;

            const content = await callDeepSeek(deepseekKey, prompt, 520);
            parsed = extractJson(content, {
                input_word: word,
                canonical_word: word,
                spelling_suspected: false,
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
