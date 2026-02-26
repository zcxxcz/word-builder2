import { SRS_INTERVALS, MAX_LEVEL } from './constants';

/**
 * Calculate next review date based on level
 * @param {number} level - Current word level (0-3)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function getNextReviewDate(level) {
    const days = SRS_INTERVALS[Math.min(level, MAX_LEVEL)] || SRS_INTERVALS[MAX_LEVEL];
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getToday() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Update word state based on review performance
 * Level only increases when BOTH recall and spelling pass during review.
 *
 * @param {object} currentState - { level, wrong_count, correct_streak }
 * @param {boolean} recallPassed - Did the user self-evaluate as "know"?
 * @param {boolean} spellingPassed - Did the user spell correctly on first try?
 * @returns {object} Updated state fields
 */
export function calculateLevelUpdate(currentState, recallPassed, spellingPassed) {
    const { level = 0, wrong_count = 0, correct_streak = 0 } = currentState;
    const bothPassed = recallPassed && spellingPassed;

    if (bothPassed) {
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
