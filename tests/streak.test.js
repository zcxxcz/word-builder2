import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateStreak } from '../src/utils/streak.js';

test('counts consecutive days including today when today is studied', () => {
    const result = calculateStreak(['2026-06-10', '2026-06-11', '2026-06-12'], '2026-06-12');

    assert.equal(result.streak, 3);
    assert.equal(result.studiedToday, true);
});

test('keeps the streak alive through yesterday when today is not studied yet', () => {
    const result = calculateStreak(['2026-06-10', '2026-06-11'], '2026-06-12');

    assert.equal(result.streak, 2);
    assert.equal(result.studiedToday, false);
});

test('a missed day breaks the streak strictly', () => {
    // Studied today and two days ago, but not yesterday-of-that-run.
    const result = calculateStreak(['2026-06-12', '2026-06-10', '2026-06-09'], '2026-06-12');

    assert.equal(result.streak, 1);
    assert.equal(result.studiedToday, true);
});

test('streak is zero when neither today nor yesterday is studied', () => {
    const result = calculateStreak(['2026-06-09', '2026-06-08'], '2026-06-12');

    assert.equal(result.streak, 0);
    assert.equal(result.studiedToday, false);
});

test('returns zero streak for empty or missing history', () => {
    assert.deepEqual(calculateStreak([], '2026-06-12'), { streak: 0, studiedToday: false });
    assert.deepEqual(calculateStreak(undefined, '2026-06-12'), { streak: 0, studiedToday: false });
});

test('duplicate session dates on the same day count once', () => {
    const result = calculateStreak(
        ['2026-06-12', '2026-06-12', '2026-06-11', '2026-06-11'],
        '2026-06-12'
    );

    assert.equal(result.streak, 2);
    assert.equal(result.studiedToday, true);
});

test('walks back across a month boundary', () => {
    const result = calculateStreak(['2026-05-30', '2026-05-31', '2026-06-01'], '2026-06-01');

    assert.equal(result.streak, 3);
    assert.equal(result.studiedToday, true);
});

test('walks back across a leap-year February boundary', () => {
    const result = calculateStreak(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01');

    assert.equal(result.streak, 3);
    assert.equal(result.studiedToday, true);
});

test('ignores unrelated or invalid date strings', () => {
    const result = calculateStreak(['2026-06-12', 'not-a-date', ''], '2026-06-12');

    assert.equal(result.streak, 1);
    assert.equal(result.studiedToday, true);
});
