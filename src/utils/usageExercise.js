const CHINESE_RE = /[\u4e00-\u9fff]/;
const ENGLISH_RE = /[A-Za-z]/;

const USAGE_PROMPT_META_PATTERNS = [
    /下面的英文/,
    /英文句子/,
    /英文.*翻译.*中文/,
    /翻译.*成中文/,
    /译成中文/,
    /请翻译/,
    /参考答案/,
    /目标词/,
];

const GAP_PROMPT_PATTERNS = [
    /什么/,
    /哪个/,
    /哪一个/,
    /某个/,
    /某种/,
    /某些/,
    /某件/,
    /东西/,
    /事物/,
    /事情/,
];

const CN_STOP_TOKENS = new Set(['的', '地', '得', '了', '是', '在', '有', '和', '或', '不', '一', '个', '人', '事', '物']);

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCn(text) {
    return String(text || '').replace(/\s+/g, '').replace(/[，。！？、；：,.!?;:"'“”‘’（）()[\]【】《》<>]/g, '');
}

function normalizeMeaningToken(token) {
    return normalizeCn(token)
        .replace(/^表示/, '')
        .replace(/[的地得]+$/g, '');
}

function addMeaningToken(tokens, token) {
    if (!token || CN_STOP_TOKENS.has(token)) return;
    if (token.length === 1 && CN_STOP_TOKENS.has(token)) return;
    tokens.add(token);
}

function getMeaningTokens(meaningCn) {
    const tokens = new Set();
    const normalizedTokens = [];
    const parts = String(meaningCn || '')
        .replace(/（[^）]*）|\([^)]*\)/g, '')
        .split(/[;；,，、/|｜\s]+/);

    parts.forEach(part => {
        const token = normalizeMeaningToken(part);
        if (!token) return;

        normalizedTokens.push(token);
        addMeaningToken(tokens, token);

        if (token.length >= 3) {
            addMeaningToken(tokens, token.slice(0, 2));
            addMeaningToken(tokens, token.slice(-2));
        }

        if (token.length >= 4) {
            addMeaningToken(tokens, token.slice(0, 3));
            addMeaningToken(tokens, token.slice(-3));
        }
    });

    const firstCharCounts = normalizedTokens.reduce((counts, token) => {
        const firstChar = token[0];
        if (firstChar && !CN_STOP_TOKENS.has(firstChar)) {
            counts.set(firstChar, (counts.get(firstChar) || 0) + 1);
        }
        return counts;
    }, new Map());

    for (const [firstChar, count] of firstCharCounts.entries()) {
        if (count >= 2) addMeaningToken(tokens, firstChar);
    }

    return [...tokens];
}

function getTargetForms(word) {
    const target = String(word || '').trim().toLowerCase();
    if (!/^[a-z]{3,}$/.test(target)) return [];

    const forms = new Set([target, `${target}s`, `${target}es`, `${target}d`, `${target}ed`, `${target}ing`]);

    if (target.endsWith('e')) {
        forms.add(`${target.slice(0, -1)}ing`);
    }

    if (target.endsWith('y') && target.length > 3) {
        forms.add(`${target.slice(0, -1)}ies`);
        forms.add(`${target.slice(0, -1)}ied`);
        forms.add(`${target.slice(0, -1)}ier`);
        forms.add(`${target.slice(0, -1)}iest`);
    }

    const irregulars = {
        be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
        do: ['does', 'did', 'done', 'doing'],
        go: ['goes', 'went', 'gone', 'going'],
        have: ['has', 'had', 'having'],
        make: ['makes', 'made', 'making'],
        run: ['runs', 'ran', 'running'],
        see: ['sees', 'saw', 'seen', 'seeing'],
        take: ['takes', 'took', 'taken', 'taking'],
    };

    irregulars[target]?.forEach(form => forms.add(form));
    return [...forms];
}

function referenceUsesTargetWord(referenceAnswerEn, word) {
    const forms = getTargetForms(word);
    if (forms.length === 0) return true;

    const answer = String(referenceAnswerEn || '').toLowerCase();
    return forms.some(form => new RegExp(`\\b${escapeRegExp(form)}\\b`).test(answer));
}

function isLikelyEnglishSentence(referenceAnswerEn) {
    const answer = String(referenceAnswerEn || '').trim();
    if (!ENGLISH_RE.test(answer)) return false;
    if (CHINESE_RE.test(answer)) return false;

    const words = answer.match(/[A-Za-z]+(?:['-][A-Za-z]+)?/g) || [];
    return words.length >= 2;
}

export function isValidUsageExercise(exercise, context = {}) {
    const promptCn = exercise?.prompt_cn?.trim() || '';
    const referenceAnswerEn = exercise?.reference_answer_en?.trim() || '';
    const meaningCn = context.meaningCn || exercise?.meaning_cn || '';

    if (!promptCn || !referenceAnswerEn) return false;
    if (!CHINESE_RE.test(promptCn)) return false;
    if (ENGLISH_RE.test(promptCn)) return false;
    if (USAGE_PROMPT_META_PATTERNS.some(pattern => pattern.test(promptCn))) return false;
    if (!isLikelyEnglishSentence(referenceAnswerEn)) return false;

    const meaningTokens = getMeaningTokens(meaningCn);
    const normalizedPrompt = normalizeCn(promptCn);
    const includesMeaning = meaningTokens.length === 0 || meaningTokens.some(token => normalizedPrompt.includes(token));
    if (!includesMeaning) return false;

    const hasGapPrompt = GAP_PROMPT_PATTERNS.some(pattern => pattern.test(promptCn));
    if (hasGapPrompt && meaningTokens.length === 0) return false;

    return referenceUsesTargetWord(referenceAnswerEn, context.word || exercise?.word || '');
}
