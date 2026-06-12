// Golden-case runner for the deepseek-proxy prompts.
// Calls the real Edge Function with the cases in tests/promptGolden/cases.json
// and checks each response against the case's expected properties, so prompt
// changes can be compared old-vs-new instead of eyeballed.
//
// Usage:
//   GOLDEN_EMAIL=... GOLDEN_PASSWORD=... node scripts/promptGolden.mjs --yes
//   node scripts/promptGolden.mjs --dry                  # list cases, no calls
//   ... --action grade_usage_answer                      # filter by action
//   ... --id grade-call-person-faithful                  # filter by id
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from env or .env.local.
// Every non-dry run consumes the account's daily AI quota (1 call per case).

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidUsageExercise } from '../src/utils/usageExercise.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES_PATH = path.join(ROOT, 'tests/promptGolden/cases.json');
const REPORTS_DIR = path.join(ROOT, 'tests/promptGolden/reports');

function loadEnvLocal() {
    try {
        const text = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
        for (const line of text.split('\n')) {
            const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
            if (match && !process.env[match[1]]) {
                process.env[match[1]] = match[2];
            }
        }
    } catch {
        // .env.local is optional when env vars are set directly
    }
}

function parseArgs(argv) {
    const args = { yes: false, dry: false, action: null, id: null };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--yes') args.yes = true;
        else if (arg === '--dry') args.dry = true;
        else if (arg === '--action') args.action = argv[++i];
        else if (arg === '--id') args.id = argv[++i];
    }
    return args;
}

const CN_PERSON_PATTERNS = [
    [/你们/, 'you'],
    [/我们/, 'we'],
    [/你/, 'you'],
    [/我/, 'i'],
    [/他们|她们/, 'they'],
    [/他|她/, 'third'],
];

const EN_SUBJECT_MAP = {
    i: 'i', my: 'i', we: 'we', our: 'we',
    you: 'you', your: 'you',
    he: 'third', she: 'third', his: 'third', her: 'third',
    they: 'they', their: 'they',
};

function detectCnPerson(promptCn) {
    for (const [pattern, person] of CN_PERSON_PATTERNS) {
        if (pattern.test(promptCn)) return person;
    }
    return null;
}

function detectEnSubject(referenceEn) {
    const first = (referenceEn || '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    return EN_SUBJECT_MAP[first] || null;
}

function evaluateGeneration(testCase, data) {
    const failures = [];
    const reviews = [];
    const context = { word: testCase.input.word, meaningCn: testCase.input.meaning_cn };

    if (testCase.expect.validExercise) {
        if (!isValidUsageExercise(data, context)) {
            failures.push('未通过前端校验 isValidUsageExercise');
        }
    }

    if (testCase.expect.personReview) {
        const cnPerson = detectCnPerson(data.prompt_cn || '');
        const enPerson = detectEnSubject(data.reference_answer_en || '');
        if (cnPerson && enPerson && cnPerson !== enPerson) {
            reviews.push(`人称疑似不配套：题面「${cnPerson}」 vs 参考答案「${enPerson}」（启发式，需人工确认）`);
        }
    }

    return { failures, reviews };
}

function evaluateGrading(testCase, data) {
    const failures = [];
    const reviews = [];
    const expect = testCase.expect;

    if (typeof expect.passed === 'boolean' && Boolean(data.passed) !== expect.passed) {
        failures.push(`passed=${data.passed}，期望 ${expect.passed}`);
    }

    const score = Number(data.score || 0);
    if (expect.scoreAtLeast !== undefined && score < expect.scoreAtLeast) {
        failures.push(`score=${score}，期望 ≥ ${expect.scoreAtLeast}`);
    }
    if (expect.scoreBelow !== undefined && score >= expect.scoreBelow) {
        failures.push(`score=${score}，期望 < ${expect.scoreBelow}`);
    }

    for (const pattern of expect.feedbackMustNotMatch || []) {
        if (new RegExp(pattern).test(data.feedback_cn || '')) {
            failures.push(`feedback 命中禁止模式 /${pattern}/`);
        }
    }

    return { failures, reviews };
}

function evaluateExplain(testCase, data) {
    const failures = [];

    if (testCase.expect.answerNonEmpty && !(data.answer_cn || '').trim()) {
        failures.push('answer_cn 为空');
    }
    for (const pattern of testCase.expect.answerMustNotMatch || []) {
        if (new RegExp(pattern).test(data.answer_cn || '')) {
            failures.push(`answer 命中禁止模式 /${pattern}/`);
        }
    }

    return { failures, reviews: [] };
}

function evaluate(testCase, data) {
    let result;
    if (testCase.action === 'generate_usage_exercise') result = evaluateGeneration(testCase, data);
    else if (testCase.action === 'grade_usage_answer') result = evaluateGrading(testCase, data);
    else result = evaluateExplain(testCase, data);

    if (testCase.expect.manualReview) {
        result.reviews.push(`人工检查：${testCase.expect.manualReview}`);
    }
    return result;
}

async function main() {
    loadEnvLocal();
    const args = parseArgs(process.argv);

    const allCases = JSON.parse(readFileSync(CASES_PATH, 'utf8')).cases;
    const cases = allCases.filter(c =>
        (!args.action || c.action === args.action) &&
        (!args.id || c.id === args.id)
    );

    if (cases.length === 0) {
        console.error('没有匹配的用例');
        process.exit(1);
    }

    if (args.dry) {
        for (const c of cases) console.log(`${c.action}  ${c.id}`);
        console.log(`\n共 ${cases.length} 个用例（--dry 模式，未发起调用）`);
        return;
    }

    if (!args.yes) {
        console.error(`即将发起 ${cases.length} 次 AI 调用（消耗该账号当日配额）。确认请加 --yes`);
        process.exit(1);
    }

    const url = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const email = process.env.GOLDEN_EMAIL;
    const password = process.env.GOLDEN_PASSWORD;

    if (!url || !anonKey) {
        console.error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（可放 .env.local）');
        process.exit(1);
    }
    if (!email || !password) {
        console.error('缺少 GOLDEN_EMAIL / GOLDEN_PASSWORD 环境变量（建议使用专用测试账号）');
        process.exit(1);
    }

    const supabase = createClient(url, anonKey);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
        console.error('登录失败：' + authError.message);
        process.exit(1);
    }

    const results = [];
    let passCount = 0, failCount = 0, reviewCount = 0, errorCount = 0;

    for (const testCase of cases) {
        let status, detail = [], data = null;
        try {
            const response = await supabase.functions.invoke('deepseek-proxy', {
                body: { action: testCase.action, ...testCase.input },
            });

            if (response.error || response.data?.error) {
                status = 'ERROR';
                detail = [response.error?.message || response.data?.error];
                errorCount++;
            } else {
                data = response.data;
                const { failures, reviews } = evaluate(testCase, data);
                if (failures.length > 0) {
                    status = 'FAIL';
                    detail = [...failures, ...reviews];
                    failCount++;
                } else if (reviews.length > 0) {
                    status = 'REVIEW';
                    detail = reviews;
                    reviewCount++;
                } else {
                    status = 'PASS';
                    passCount++;
                }
            }
        } catch (err) {
            status = 'ERROR';
            detail = [err.message];
            errorCount++;
        }

        console.log(`[${status}] ${testCase.id}`);
        for (const line of detail) console.log(`        ${line}`);
        if (data && testCase.action === 'generate_usage_exercise') {
            console.log(`        题面: ${data.prompt_cn}`);
            console.log(`        参考: ${data.reference_answer_en}`);
        }
        if (data && testCase.action === 'grade_usage_answer') {
            console.log(`        passed=${data.passed} score=${data.score}`);
            console.log(`        feedback: ${data.feedback_cn}`);
            console.log(`        corrected: ${data.corrected_answer_en}`);
        }
        if (data && testCase.action === 'explain_usage_question') {
            console.log(`        answer: ${data.answer_cn}`);
        }

        results.push({ id: testCase.id, action: testCase.action, status, detail, output: data });
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n共 ${cases.length}：PASS ${passCount} / FAIL ${failCount} / REVIEW ${reviewCount} / ERROR ${errorCount}`);

    mkdirSync(REPORTS_DIR, { recursive: true });
    const reportPath = path.join(REPORTS_DIR, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
    console.log(`报告已写入 ${path.relative(ROOT, reportPath)}`);

    process.exit(failCount > 0 || errorCount > 0 ? 1 : 0);
}

main();
