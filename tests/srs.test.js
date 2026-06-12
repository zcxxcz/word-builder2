import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addDaysToStudyDate,
    calculateLevelUpdate,
    getReviewIntervalDays,
    getToday,
} from '../src/utils/srs.js';

test('intervals below L3 are fixed regardless of streak', () => {
    assert.equal(getReviewIntervalDays(0, 0), 1);
    assert.equal(getReviewIntervalDays(1, 5), 2);
    assert.equal(getReviewIntervalDays(2, 10), 5);
});

test('L3 interval doubles with consecutive passes and caps at 80 days', () => {
    // Clean climb reaches L3 with streak 3 -> first maintenance window is 10d
    assert.equal(getReviewIntervalDays(3, 3), 10);
    assert.equal(getReviewIntervalDays(3, 4), 20);
    assert.equal(getReviewIntervalDays(3, 5), 40);
    assert.equal(getReviewIntervalDays(3, 6), 80);
    assert.equal(getReviewIntervalDays(3, 12), 80);
});

test('reclimbing after a failure restarts the L3 ramp conservatively', () => {
    // Failed at L3, repassed L2 -> back at L3 with a short streak: 10d checks
    assert.equal(getReviewIntervalDays(3, 1), 10);
    assert.equal(getReviewIntervalDays(3, 2), 10);
});

test('passing a review at L3 schedules the doubled interval', () => {
    const updates = calculateLevelUpdate(
        { level: 3, wrong_count: 0, correct_streak: 4 },
        true, true, true
    );

    assert.equal(updates.level, 3);
    assert.equal(updates.correct_streak, 5);
    // newStreak 5 -> 2 extra passes -> 40 days
    assert.equal(updates.next_review_at, addDaysToStudyDate(getToday(), 40));
});

test('promotion to L3 starts maintenance at 10 days', () => {
    const updates = calculateLevelUpdate(
        { level: 2, wrong_count: 0, correct_streak: 2 },
        true, true, true
    );

    assert.equal(updates.level, 3);
    assert.equal(updates.next_review_at, addDaysToStudyDate(getToday(), 10));
});

test('failure at L3 drops to L2, resets streak, schedules 5 days', () => {
    const updates = calculateLevelUpdate(
        { level: 3, wrong_count: 1, correct_streak: 6 },
        true, false, true
    );

    assert.equal(updates.level, 2);
    assert.equal(updates.correct_streak, 0);
    assert.equal(updates.wrong_count, 2);
    assert.equal(updates.next_review_at, addDaysToStudyDate(getToday(), 5));
});
