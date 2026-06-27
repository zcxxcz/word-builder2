// SRS intervals (in days) by level
export const SRS_INTERVALS = {
    0: 1,   // L0 → +1 day
    1: 2,   // L1 → +2 days
    2: 5,   // L2 → +5 days
    3: 10,  // L3 → +10 days
};

export const MAX_LEVEL = 3;

export const LEVEL_LABELS = {
    0: 'L0 陌生',
    1: 'L1 认识',
    2: 'L2 熟练',
    3: 'L3 掌握',
};

export const LEVEL_SHORT_LABELS = {
    0: 'L0',
    1: 'L1',
    2: 'L2',
    3: 'L3',
};

export const DAILY_NEW_LIMIT = 20;
export const REVIEW_BATCH_LIMIT = 10;
export const STUDY_TIME_BUDGET_MINUTES = 30;

// Default daily task parameters
export const DEFAULT_SETTINGS = {
    daily_new: 5,
    review_cap: 8,
    relapse_cap: 5,
    tts_enabled: true,
    tts_rate: 1.0,
    sound_enabled: true,
    usage_scene_mode: 'rotate',
};

export const STUDY_PRESETS = [
    {
        id: 'light',
        label: '轻松',
        description: '新学 3 · 复习 6 · 回流 3',
        daily_new: 3,
        review_cap: 6,
        relapse_cap: 3,
    },
    {
        id: 'standard',
        label: '标准',
        description: '新学 5 · 复习 8 · 回流 5',
        daily_new: DEFAULT_SETTINGS.daily_new,
        review_cap: DEFAULT_SETTINGS.review_cap,
        relapse_cap: DEFAULT_SETTINGS.relapse_cap,
    },
    {
        id: 'intensive',
        label: '强化',
        description: '新学 10 · 复习 10 · 回流 10',
        daily_new: 10,
        review_cap: REVIEW_BATCH_LIMIT,
        relapse_cap: 10,
    },
];

// DeepSeek AI daily generation limit per user
export const AI_DAILY_LIMIT = 100;
export const USAGE_AI_DAILY_LIMIT = 500;
export const USAGE_QUESTION_DAILY_LIMIT = 200;

// Study session phases
export const PHASE = {
    REVIEW: 'review',
    NEW_LEARN: 'new_learn',
    NEW_REVIEW: 'new_review',
    RELAPSE: 'relapse',
    COMPLETE: 'complete',
};

// Study step types
export const STEP = {
    LEARN: 'learn',         // New-learn presentation: 新词认识（无对错）
    RECALL: 'recall',       // Step A: 意思回想
    SPELLING: 'spelling',   // Step B: 拼写打字
    USAGE: 'usage',         // Step C: 场景应用
};
