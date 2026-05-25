import { SRS_INTERVALS, MAX_LEVEL } from './constants';

export const STUDY_TIME_ZONE = 'Asia/Shanghai';

function getStudyDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('zh-CN-u-nu-latn', {
        timeZone: STUDY_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
        year: values.year,
        month: values.month,
        day: values.day,
    };
}

function dateStringToShanghaiNoonUtc(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 4));
}

export function addDaysToStudyDate(dateString, days) {
    const date = dateStringToShanghaiNoonUtc(dateString);
    date.setUTCDate(date.getUTCDate() + days);
    return getToday(date);
}

/**
 * Calculate next review date based on level
 * @param {number} level - Current word level (0-3)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function getNextReviewDate(level, fromDate = new Date()) {
    const days = SRS_INTERVALS[Math.min(level, MAX_LEVEL)] || SRS_INTERVALS[MAX_LEVEL];
    return addDaysToStudyDate(getToday(fromDate), days);
}

/**
 * Get today's study date as YYYY-MM-DD in the app's China-time study day.
 */
export function getToday(date = new Date()) {
    const { year, month, day } = getStudyDateParts(date);
    return `${year}-${month}-${day}`;
}

export function getStudyDateDaysAgo(days, fromDate = new Date()) {
    return addDaysToStudyDate(getToday(fromDate), -days);
}

export function formatStudyDateForDisplay(dateString, options = { month: 'short', day: 'numeric' }) {
    return dateStringToShanghaiNoonUtc(dateString).toLocaleDateString('zh-CN', {
        timeZone: STUDY_TIME_ZONE,
        ...options,
    });
}

/**
 * Update word state based on review performance
 * Level only increases when recall, spelling, and usage all pass during review.
 *
 * @param {object} currentState - { level, wrong_count, correct_streak }
 * @param {boolean} recallPassed - Did the user self-evaluate as "know"?
 * @param {boolean} spellingPassed - Did the user spell correctly on first try?
 * @param {boolean} usagePassed - Did the user apply the word in a usage sentence?
 * @returns {object} Updated state fields
 */
export function calculateLevelUpdate(currentState, recallPassed, spellingPassed, usagePassed = true) {
    const { level = 0, wrong_count = 0, correct_streak = 0 } = currentState;
    const allPassed = recallPassed && spellingPassed && usagePassed;

    if (allPassed) {
        const newLevel = Math.min(level + 1, MAX_LEVEL);
        return {
            level: newLevel,
            next_review_at: getNextReviewDate(newLevel),
            correct_streak: correct_streak + 1,
            wrong_count,
            last_seen_at: new Date().toISOString(),
        };
    } else {
        // Failed: level drops by 1 (min 0), reset streak
        const newLevel = Math.max(level - 1, 0);
        return {
            level: newLevel,
            next_review_at: getNextReviewDate(newLevel),
            correct_streak: 0,
            wrong_count: wrong_count + 1,
            last_seen_at: new Date().toISOString(),
        };
    }
}

/**
 * Shuffle array (Fisher-Yates)
 */
export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
