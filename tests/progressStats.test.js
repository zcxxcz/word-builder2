import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildThirtyMinuteStudyPlan,
    buildHeatmapWeeks,
    buildWeeklyAccuracy,
    estimateStudyMinutes,
    getHeatLevel,
    getWeekStart,
} from '../src/utils/progressStats.js';

test('getWeekStart returns the Monday of the week', () => {
    assert.equal(getWeekStart('2026-06-12'), '2026-06-08'); // Friday -> Monday
    assert.equal(getWeekStart('2026-06-08'), '2026-06-08'); // Monday stays
    assert.equal(getWeekStart('2026-06-14'), '2026-06-08'); // Sunday belongs to same week
    assert.equal(getWeekStart('2026-06-01'), '2026-06-01');
});

test('heatmap grid has the requested shape and ends in the current week', () => {
    const weeks = buildHeatmapWeeks([], '2026-06-12', 12);

    assert.equal(weeks.length, 12);
    assert.ok(weeks.every(week => week.length === 7));
    assert.equal(weeks[11][0].date, '2026-06-08');
    assert.equal(weeks[11][6].date, '2026-06-14');
    assert.equal(weeks[0][0].date, getWeekStart('2026-03-23'));
});

test('heatmap sums words per day across multiple sessions', () => {
    const weeks = buildHeatmapWeeks([
        { date: '2026-06-12', new_count: 5, review_count: 10 },
        { date: '2026-06-12', new_count: 0, review_count: 8 },
        { date: '2026-06-10', new_count: 3, review_count: 0 },
    ], '2026-06-12', 2);

    const days = weeks.flat();
    const friday = days.find(d => d.date === '2026-06-12');
    const wednesday = days.find(d => d.date === '2026-06-10');
    const monday = days.find(d => d.date === '2026-06-08');

    assert.equal(friday.count, 23);
    assert.equal(wednesday.count, 3);
    assert.equal(monday.count, 0);
});

test('heatmap marks days after today as future', () => {
    const weeks = buildHeatmapWeeks([], '2026-06-12', 1);
    const days = weeks[0];

    assert.equal(days.find(d => d.date === '2026-06-12').future, false);
    assert.equal(days.find(d => d.date === '2026-06-13').future, true);
    assert.equal(days.find(d => d.date === '2026-06-14').future, true);
});

test('heat level buckets word counts', () => {
    assert.equal(getHeatLevel(0), 0);
    assert.equal(getHeatLevel(1), 1);
    assert.equal(getHeatLevel(10), 2);
    assert.equal(getHeatLevel(20), 3);
    assert.equal(getHeatLevel(40), 4);
});

test('weekly accuracy is weighted by words practiced', () => {
    const result = buildWeeklyAccuracy([
        // Same week: 10 words at 100% + 10 words at 50% -> 75%
        { date: '2026-06-08', new_count: 0, review_count: 10, spelling_accuracy: 1 },
        { date: '2026-06-10', new_count: 10, review_count: 0, spelling_accuracy: 0.5 },
    ], '2026-06-12', 2);

    assert.equal(result.length, 2);
    assert.equal(result[1].weekStart, '2026-06-08');
    assert.equal(result[1].accuracy, 0.75);
    assert.equal(result[1].words, 20);
    assert.equal(result[0].accuracy, null);
    assert.equal(result[0].words, 0);
});

test('weekly accuracy ignores sessions without practiced words', () => {
    const result = buildWeeklyAccuracy([
        { date: '2026-06-08', new_count: 0, review_count: 0, spelling_accuracy: 0 },
    ], '2026-06-12', 1);

    assert.equal(result[0].accuracy, null);
});

test('estimate falls back to default pace without enough history', () => {
    assert.equal(estimateStudyMinutes([], 10), 17); // 10 * 1.7
    assert.equal(estimateStudyMinutes(null, 10), 17);
    // 4 words of history is below the 5-word threshold
    assert.equal(estimateStudyMinutes([
        { new_count: 4, review_count: 0, duration_seconds: 60 },
    ], 10), 17);
});

test('estimate uses the real per-word pace from recent sessions', () => {
    // 20 words in 1200s -> 1 min/word
    const sessions = [
        { new_count: 0, review_count: 10, duration_seconds: 600 },
        { new_count: 10, review_count: 0, duration_seconds: 600 },
    ];

    assert.equal(estimateStudyMinutes(sessions, 8), 8);
});

test('estimate clamps outlier paces', () => {
    // Session left open: 10 words in 2 hours -> clamped to 5 min/word
    assert.equal(estimateStudyMinutes([
        { new_count: 0, review_count: 10, duration_seconds: 7200 },
    ], 10), 50);
    // Unrealistically fast -> clamped to 0.5 min/word
    assert.equal(estimateStudyMinutes([
        { new_count: 0, review_count: 10, duration_seconds: 10 },
    ], 10), 5);
});

test('estimate returns zero for an empty batch and at least one minute otherwise', () => {
    assert.equal(estimateStudyMinutes([], 0), 0);
    assert.equal(estimateStudyMinutes([
        { new_count: 0, review_count: 10, duration_seconds: 300 },
    ], 1), 1);
});

test('30-minute plan uses default pace without recent history', () => {
    const plan = buildThirtyMinuteStudyPlan([], {
        reviewCount: 20,
        newCount: 100,
    }, {
        daily_new: 5,
        review_cap: 8,
        relapse_cap: 5,
    });

    assert.equal(plan.recommendedReviewCount, 8);
    assert.equal(plan.recommendedNewCount, 0);
    assert.equal(plan.hasDeferredReviews, true);
    assert.ok(plan.totalMinutes <= 30);
});

test('30-minute plan lowers the review batch for slow recent pace', () => {
    const plan = buildThirtyMinuteStudyPlan([
        { new_count: 0, review_count: 10, duration_seconds: 3000 },
    ], {
        reviewCount: 20,
        newCount: 100,
    }, {
        daily_new: 10,
        review_cap: 10,
        relapse_cap: 10,
    });

    assert.equal(plan.recommendedReviewCount, 6);
    assert.equal(plan.recommendedNewCount, 0);
    assert.equal(plan.deferredReviewCount, 14);
    assert.equal(plan.totalMinutes, 30);
});

test('30-minute plan recommends new words only after review pressure fits the budget', () => {
    const plan = buildThirtyMinuteStudyPlan([
        { new_count: 0, review_count: 10, duration_seconds: 600 },
    ], {
        reviewCount: 4,
        newCount: 20,
    }, {
        daily_new: 5,
        review_cap: 8,
        relapse_cap: 5,
    });

    assert.equal(plan.recommendedReviewCount, 4);
    assert.equal(plan.hasDeferredReviews, false);
    assert.equal(plan.recommendedNewCount, 5);
    assert.ok(plan.totalMinutes <= 30);
});

test('weekly accuracy buckets sessions into their own weeks', () => {
    const result = buildWeeklyAccuracy([
        { date: '2026-06-01', new_count: 0, review_count: 10, spelling_accuracy: 0.6 },
        { date: '2026-06-12', new_count: 0, review_count: 10, spelling_accuracy: 0.9 },
    ], '2026-06-12', 2);

    assert.equal(result[0].weekStart, '2026-06-01');
    assert.equal(result[0].accuracy, 0.6);
    assert.equal(result[1].weekStart, '2026-06-08');
    assert.equal(result[1].accuracy, 0.9);
});
