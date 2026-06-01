import assert from 'node:assert/strict';
import test from 'node:test';

import {
    chooseUsageExercise,
    getNextUsageVariantIndex,
    normalizeUsageVariantIndex,
    withDefaultVariant,
} from '../src/utils/usageVariant.js';

const isValid = (exercise) => Boolean(exercise?.prompt_cn && exercise?.reference_answer_en);

test('treats legacy usage exercises without variant_index as scene A', () => {
    const exercise = withDefaultVariant({
        prompt_cn: '她的洞察力帮助我们解决了这个问题。',
        reference_answer_en: 'Her insight helped us solve the problem.',
    });

    assert.equal(exercise.variant_index, 0);
});

test('prefers scene B when next usage variant is B and both scenes exist', () => {
    const choice = chooseUsageExercise([
        {
            variant_index: 0,
            prompt_cn: '她的洞察力帮助我们解决了这个问题。',
            reference_answer_en: 'Her insight helped us solve the problem.',
        },
        {
            variant_index: 1,
            prompt_cn: '这个故事给了我新的洞察。',
            reference_answer_en: 'This story gave me a new insight.',
        },
    ], 1, isValid);

    assert.equal(choice.variant_index, 1);
    assert.equal(choice.usedFallback, false);
    assert.equal(choice.exercise.prompt_cn, '这个故事给了我新的洞察。');
});

test('falls back to the other valid scene when the target scene is missing', () => {
    const choice = chooseUsageExercise([
        {
            variant_index: 0,
            prompt_cn: '她的洞察力帮助我们解决了这个问题。',
            reference_answer_en: 'Her insight helped us solve the problem.',
        },
    ], 1, isValid);

    assert.equal(choice.variant_index, 0);
    assert.equal(choice.usedFallback, true);
});

test('normalizes imported or invalid variant values to scene A', () => {
    assert.equal(normalizeUsageVariantIndex(undefined), 0);
    assert.equal(normalizeUsageVariantIndex('bad'), 0);
    assert.equal(normalizeUsageVariantIndex(9), 0);
});

test('toggles between the two usage scenes', () => {
    assert.equal(getNextUsageVariantIndex(0), 1);
    assert.equal(getNextUsageVariantIndex(1), 0);
});
