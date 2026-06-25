const STAGE_LABELS = {
    primary: '小学',
    junior: '初中',
    senior: '高中',
    college: '大学',
    general: '通用',
};

export const VOCABULARY_STAGE_OPTIONS = [
    { category: 'primary', label: '小学' },
    { category: 'junior', label: '初中' },
    { category: 'senior', label: '高中' },
    { category: 'cet4', label: '大学四级' },
    { category: 'cet6', label: '大学六级' },
];

const VOCABULARY_STAGE_PRIORITY = new Map(
    VOCABULARY_STAGE_OPTIONS.map((option, index) => [option.category, index])
);

const COMMONNESS_LABELS = {
    high: '高',
    medium: '中',
    low: '低',
};

const IRREGULAR_FORMS = {
    children: 'child',
    feet: 'foot',
    geese: 'goose',
    men: 'man',
    mice: 'mouse',
    people: 'person',
    teeth: 'tooth',
    women: 'woman',
    better: 'good',
    best: 'good',
    worse: 'bad',
    worst: 'bad',
    went: 'go',
    gone: 'go',
    did: 'do',
    done: 'do',
    had: 'have',
    made: 'make',
    took: 'take',
    taken: 'take',
    wrote: 'write',
    written: 'write',
    ran: 'run',
    saw: 'see',
    seen: 'see',
};

export function normalizeVocabularyWord(word) {
    return String(word || '')
        .normalize('NFC')
        .trim()
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/[‐‑‒–—]/g, '-')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ');
}

function addCandidate(candidates, value) {
    const normalized = normalizeVocabularyWord(value);
    if (
        normalized.length >= 1
        && /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'-]*(?: [A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'-]*)*$/.test(normalized)
    ) {
        candidates.add(normalized);
    }
}

function addDedoubledCandidate(candidates, stem) {
    if (stem.length >= 3 && stem.at(-1) === stem.at(-2)) {
        addCandidate(candidates, stem.slice(0, -1));
    }
}

function getSingleWordInflectionCandidates(word) {
    const normalized = normalizeVocabularyWord(word);
    const candidates = new Set();
    addCandidate(candidates, normalized);

    if (!/^[a-z][a-z'-]*$/.test(normalized)) {
        return [...candidates];
    }

    addCandidate(candidates, IRREGULAR_FORMS[normalized]);

    if (normalized.endsWith('ies') && normalized.length > 4) {
        addCandidate(candidates, `${normalized.slice(0, -3)}y`);
    }

    if (normalized.endsWith('ves') && normalized.length > 4) {
        addCandidate(candidates, `${normalized.slice(0, -3)}f`);
        addCandidate(candidates, `${normalized.slice(0, -3)}fe`);
    }

    if (normalized.endsWith('ing') && normalized.length > 5) {
        const stem = normalized.slice(0, -3);
        addCandidate(candidates, stem);
        addDedoubledCandidate(candidates, stem);
        addCandidate(candidates, `${stem}e`);
    }

    if (normalized.endsWith('ied') && normalized.length > 4) {
        addCandidate(candidates, `${normalized.slice(0, -3)}y`);
    } else if (normalized.endsWith('ed') && normalized.length > 4) {
        const stem = normalized.slice(0, -2);
        addCandidate(candidates, stem);
        addDedoubledCandidate(candidates, stem);
        addCandidate(candidates, `${stem}e`);
    }

    if (normalized.endsWith('est') && normalized.length > 5) {
        const stem = normalized.slice(0, -3);
        addCandidate(candidates, stem);
        addDedoubledCandidate(candidates, stem);
        if (stem.endsWith('i')) addCandidate(candidates, `${stem.slice(0, -1)}y`);
    } else if (normalized.endsWith('er') && normalized.length > 4) {
        const stem = normalized.slice(0, -2);
        addCandidate(candidates, stem);
        addDedoubledCandidate(candidates, stem);
        if (stem.endsWith('i')) addCandidate(candidates, `${stem.slice(0, -1)}y`);
    }

    if (normalized.endsWith('es') && normalized.length > 4) {
        addCandidate(candidates, normalized.slice(0, -2));
    }

    if (normalized.endsWith('s') && !normalized.endsWith('ss') && normalized.length > 3) {
        addCandidate(candidates, normalized.slice(0, -1));
    }

    return [...candidates];
}

export function getVocabularyExactCandidates(word) {
    const normalized = normalizeVocabularyWord(word);
    const candidates = new Set();
    addCandidate(candidates, normalized);
    addCandidate(
        candidates,
        normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );

    if (normalized.includes('-')) {
        addCandidate(candidates, normalized.replace(/-+/g, ' '));
    }
    if (normalized.includes(' ') && normalized.split(' ').length === 2) {
        addCandidate(candidates, normalized.replace(/ /g, '-'));
    }
    if (/^(?:[A-Za-zÀ-ÖØ-öø-ÿ]\.)+[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(normalized)) {
        addCandidate(candidates, `${normalized}.`);
    }

    return [...candidates];
}

export function getVocabularyLookupCandidates(word) {
    const exactCandidates = getVocabularyExactCandidates(word);
    const normalized = exactCandidates[0] || '';
    const candidates = new Set(exactCandidates);

    if (!normalized || normalized.includes('.')) {
        return [...candidates];
    }

    const phrase = exactCandidates.find(candidate => candidate.includes(' '));
    if (phrase) {
        const words = phrase.split(' ');
        const positions = [...new Set([0, words.length - 1])];
        for (const position of positions) {
            for (const form of getSingleWordInflectionCandidates(words[position]).slice(1)) {
                const changedWords = [...words];
                changedWords[position] = form;
                const changedPhrase = changedWords.join(' ');
                addCandidate(candidates, changedPhrase);
                if (changedWords.length === 2) {
                    addCandidate(candidates, changedPhrase.replace(' ', '-'));
                }
            }
        }
        return [...candidates];
    }

    for (const candidate of getSingleWordInflectionCandidates(normalized).slice(1)) {
        addCandidate(candidates, candidate);
    }
    return [...candidates];
}

export function getVocabularyStageCategory(source) {
    if (source?.stage_code === 'primary') return 'primary';
    if (source?.stage_code === 'junior') return 'junior';
    if (source?.stage_code === 'senior') return 'senior';
    if (source?.source_key === 'cet-4') return 'cet4';
    if (source?.source_key === 'cet-6') return 'cet6';
    return null;
}

export function getVocabularyStageLabel(category) {
    return VOCABULARY_STAGE_OPTIONS.find(option => option.category === category)?.label || '未分类';
}

export function buildVocabularyStageResult(word, memberships = [], options = {}) {
    const inputWord = normalizeVocabularyWord(word);
    const categories = (memberships || [])
        .map(membership => getVocabularyStageCategory(membership.source))
        .filter(Boolean)
        .sort((a, b) => (
            VOCABULARY_STAGE_PRIORITY.get(a) - VOCABULARY_STAGE_PRIORITY.get(b)
        ));
    const category = categories[0] || null;
    const status = options.unavailable
        ? 'unavailable'
        : (category ? 'matched' : 'not_found');

    return {
        inputWord,
        category,
        label: status === 'unavailable'
            ? '识别暂不可用'
            : getVocabularyStageLabel(category),
        status,
        matchedByInflection: Boolean(options.matchedByInflection),
    };
}

function dedupeSources(memberships) {
    const sources = new Map();
    for (const membership of memberships || []) {
        const source = membership.source;
        if (!source?.source_key || sources.has(source.source_key)) continue;
        sources.set(source.source_key, {
            ...source,
            coverage_label: membership.coverage_label || '',
        });
    }
    return [...sources.values()].sort((a, b) => (
        (Number(a.stage_rank) || 999) - (Number(b.stage_rank) || 999)
        || a.display_name.localeCompare(b.display_name, 'zh-CN')
    ));
}

function makeAdvice(sources, frequency) {
    if (sources.length > 0) {
        const earliest = sources[0];
        const stage = STAGE_LABELS[earliest.stage_code] || earliest.stage_code || '当前';
        if (earliest.stage_code === 'primary') return '小学阶段已出现，建议优先掌握。';
        if (earliest.stage_code === 'junior') return '属于初中阶段值得掌握的词汇。';
        if (earliest.stage_code === 'senior') return '主要在高中阶段出现，可结合当前课文决定是否学习。';
        if (earliest.stage_code === 'college') return '主要属于大学考试或大学学习词汇，可稍后学习。';
        return `最早在${stage}来源中收录，可结合当前材料决定是否学习。`;
    }

    if (frequency?.commonness_band === 'high') {
        return '教材与考试索引暂未收录，但语料中较常见，可结合当前语境学习。';
    }
    return '现有可靠词库暂未收录，可保存，但暂不判断学习阶段。';
}

export function buildVocabularyProfile(word, memberships = [], frequencies = [], options = {}) {
    const normalizedWord = normalizeVocabularyWord(word);
    const sources = dedupeSources(memberships);
    const frequency = (frequencies || [])
        .slice()
        .sort((a, b) => (Number(b.zipf_frequency) || 0) - (Number(a.zipf_frequency) || 0))[0] || null;
    const canonicalWord = memberships.find(item => item.canonical_word === normalizedWord)?.canonical_word
        || memberships[0]?.canonical_word
        || normalizedWord;

    const hasEvidence = sources.length > 0 || Boolean(frequency);
    const status = hasEvidence ? 'matched' : (options.unavailable ? 'unavailable' : 'not_found');

    return {
        status,
        inputWord: normalizedWord,
        canonicalWord,
        matchedByInflection: Boolean(options.matchedByInflection),
        sources,
        earliestStage: sources[0]?.stage_code || null,
        earliestStageLabel: sources[0] ? (STAGE_LABELS[sources[0].stage_code] || sources[0].stage_code) : '',
        frequency: frequency ? {
            ...frequency,
            label: COMMONNESS_LABELS[frequency.commonness_band] || '未知',
        } : null,
        advice: makeAdvice(sources, frequency),
    };
}
