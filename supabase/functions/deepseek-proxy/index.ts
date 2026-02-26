// DeepSeek API Proxy Edge Function
// Deploy to Supabase Edge Functions
// Environment variable needed: DEEPSEEK_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DAILY_LIMIT = 30;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Verify auth
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: '未授权' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Create Supabase client with user's token
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: '认证失败' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        let genCount = 0;
        if (settings?.daily_gen_count && settings?.last_gen_date === today) {
            genCount = settings.daily_gen_count;
        }

        if (genCount >= DAILY_LIMIT) {
            return new Response(JSON.stringify({ error: '今日AI生成次数已用完（30/30），明天再试或手动填写' }), {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Parse request
        const { word } = await req.json();
        if (!word || typeof word !== 'string') {
            return new Response(JSON.stringify({ error: '请提供英文单词' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Call DeepSeek API
        const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
        if (!deepseekKey) {
            return new Response(JSON.stringify({ error: 'API key not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
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
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('DeepSeek API error:', errText);
            return new Response(JSON.stringify({ error: '生成失败，请稍后再试' }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || '';

        // Parse JSON from response
        let parsed;
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch {
            // Fallback
            parsed = {
                meaning_cn: '未找到释义',
                phonetic: '',
                example: '',
            };
        }

        // Update daily count
        await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                daily_gen_count: genCount + 1,
                last_gen_date: today,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Edge function error:', error);
        return new Response(JSON.stringify({ error: '服务器错误' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
