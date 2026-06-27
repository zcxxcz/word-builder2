import { addDaysToStudyDate } from './srs.js';
import {
    DAILY_NEW_LIMIT,
    DEFAULT_SETTINGS,
    REVIEW_BATCH_LIMIT,
    STUDY_TIME_BUDGET_MINUTES,
} from './constants.js';

const DEFAULT_MINUTES_PER_REVIEW_WORD = 1.7;
const MIN_PACE_MINUTES = 0.5;
const MAX_PACE_MINUTES = 5;
const NEW_WORD_REVIEW_WEIGHT = 5 / 3;

function getWeekdayIndex(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Monday = 0 ... Sunday = 6
    return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function getWeekStart(dateString) {
    return addDaysToStudyDate(dateString, -getWeekdayIndex(dateString));
}

/**
 * Build a Monday-first heatmap grid of studied word counts.
 * Returns `weekCount` weeks (oldest first), each an array of 7 day cells:
 * { date, count, future }.
 */
export function buildHeatmapWeeks(sessions, today, weekCount = 12) {
    const totals = new Map();
    for (const session of sessions || []) {
        if (!session?.date) continue;
        const words = (session.new_count || 0) + (session.review_count || 0);
        totals.set(session.date, (totals.get(session.date) || 0) + words);
    }

    const thisWeekStart = getWeekStart(today);
    const weeks = [];
    for (let w = weekCount - 1; w >= 0; w--) {
        const weekStart = addDaysToStudyDate(thisWeekStart, -7 * w);
        const days = [];
        for (let d = 0; d < 7; d++) {
            const date = addDaysToStudyDate(weekStart, d);
            days.push({
                date,
                count: totals.get(date) || 0,
                future: date > today,
            });
        }
        weeks.push(days);
    }
    return weeks;
}

export function getHeatLevel(count) {
    if (count <= 0) return 0;
    if (count < 10) return 1;
    if (count < 20) return 2;
    if (count < 40) return 3;
    return 4;
}

/**
 * Estimate study minutes for a batch from the user's recent real pace.
 * Falls back to a per-word default (recall + spelling + usage) until there
 * is enough history; pace is clamped against outliers such as sessions left
 * open in the background.
 */
export function estimateStudyMinutes(recentSessions, wordCount, fallbackMinutesPerWord = 1.7) {
    if (!wordCount || wordCount <= 0) return 0;

    const perWordMinutes = getStudyPaceMinutes(recentSessions, fallbackMinutesPerWord);
    return Math.max(1, Math.ceil(wordCount * perWordMinutes));
}

export function getStudyPaceMinutes(recentSessions, fallbackMinutesPerWord = DEFAULT_MINUTES_PER_REVIEW_WORD) {
    let totalSeconds = 0;
    let totalWords = 0;
    for (const session of recentSessions || []) {
        const words = (session.new_count || 0) + (session.review_count || 0);
        const seconds = session.duration_seconds || 0;
        if (words <= 0 || seconds <= 0) continue;
        totalWords += words;
        totalSeconds += seconds;
    }

    if (totalWords < 5) return fallbackMinutesPerWord;

    return Math.min(MAX_PACE_MINUTES, Math.max(MIN_PACE_MINUTES, totalSeconds / totalWords / 60));
}

export function buildThirtyMinuteStudyPlan(
    recentSessions,
    counts,
    settings = {},
    targetMinutes = STUDY_TIME_BUDGET_MINUTES
) {
    const dueCount = Math.max(0, counts?.reviewCount || 0);
    const availableNewCount = Math.max(0, counts?.newCount || 0);
    const reviewCap = Math.min(settings.review_cap ?? REVIEW_BATCH_LIMIT, REVIEW_BATCH_LIMIT);
    const dailyNewLimit = Math.min(settings.daily_new ?? DEFAULT_SETTINGS.daily_new, DAILY_NEW_LIMIT);
    const paceMinutes = getStudyPaceMinutes(recentSessions);
    const maxReviewsByTime = Math.max(1, Math.floor(targetMinutes / paceMinutes));
    const recommendedReviewCount = dueCount > 0
        ? Math.min(dueCount, reviewCap, maxReviewsByTime)
        : 0;
    const reviewMinutes = recommendedReviewCount > 0
        ? Math.ceil(recommendedReviewCount * paceMinutes)
        : 0;
    const hasDeferredReviews = dueCount > recommendedReviewCount;
    const remainingMinutes = Math.max(0, targetMinutes - reviewMinutes);
    const minutesPerNewWord = paceMinutes * NEW_WORD_REVIEW_WEIGHT;
    const recommendedNewCount = !hasDeferredReviews && remainingMinutes >= minutesPerNewWord
        ? Math.min(availableNewCount, dailyNewLimit, Math.floor(remainingMinutes / minutesPerNewWord))
        : 0;
    const totalMinutes = Math.max(
        recommendedReviewCount || recommendedNewCount ? 1 : 0,
        Math.ceil((recommendedReviewCount * paceMinutes) + (recommendedNewCount * minutesPerNewWord))
    );

    return {
        targetMinutes,
        paceMinutes,
        recommendedReviewCount,
        recommendedNewCount,
        reviewMinutes,
        totalMinutes,
        hasDeferredReviews,
        deferredReviewCount: Math.max(0, dueCount - recommendedReviewCount),
        shouldSuggestNewWords: recommendedNewCount > 0,
    };
}

/**
 * Aggregate spelling accuracy per study week (Monday-first), weighted by
 * words practiced. Returns `weekCount` entries (oldest first):
 * { weekStart, accuracy (0-1 or null), words }.
 */
export function buildWeeklyAccuracy(sessions, today, weekCount = 8) {
    const byWeek = new Map();
    for (const session of sessions || []) {
        if (!session?.date) continue;
        const weight = (session.new_count || 0) + (session.review_count || 0);
        if (weight <= 0) continue;

        const weekStart = getWeekStart(session.date);
        const agg = byWeek.get(weekStart) || { weighted: 0, weight: 0 };
        agg.weighted += (session.spelling_accuracy || 0) * weight;
        agg.weight += weight;
        byWeek.set(weekStart, agg);
    }

    const thisWeekStart = getWeekStart(today);
    const result = [];
    for (let w = weekCount - 1; w >= 0; w--) {
        const weekStart = addDaysToStudyDate(thisWeekStart, -7 * w);
        const agg = byWeek.get(weekStart);
        result.push({
            weekStart,
            accuracy: agg ? agg.weighted / agg.weight : null,
            words: agg ? agg.weight : 0,
        });
    }
    return result;
}
