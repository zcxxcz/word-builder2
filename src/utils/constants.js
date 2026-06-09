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

export const REVIEW_BATCH_LIMIT = 10;

// Default daily task parameters
export const DEFAULT_SETTINGS = {
    daily_new: 10,
    review_cap: REVIEW_BATCH_LIMIT,
    relapse_cap: 10,
    tts_enabled: true,
    tts_rate: 1.0,
    usage_scene_mode: 'rotate',
};

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
    RECALL: 'recall',       // Step A: 意思回想
    SPELLING: 'spelling',   // Step B: 拼写打字
    USAGE: 'usage',         // Step C: 场景应用
};
