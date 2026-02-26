// SRS intervals (in days) by level
export const SRS_INTERVALS = {
    0: 1,   // L0 → +1 day
    1: 2,   // L1 → +2 days
    2: 5,   // L2 → +5 days
    3: 10,  // L3 → +10 days
};

export const MAX_LEVEL = 3;

// Default daily task parameters
export const DEFAULT_SETTINGS = {
    daily_new: 10,
    review_cap: 40,
    relapse_cap: 10,
    tts_enabled: true,
    tts_rate: 1.0,
};

// DeepSeek AI daily generation limit per user
export const AI_DAILY_LIMIT = 30;

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
};
