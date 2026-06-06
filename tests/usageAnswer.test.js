import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isEquivalentUsageAnswer,
    normalizeUsageAnswer,
} from '../src/utils/usageAnswer.js';

test('normalizes simple usage answer differences', () => {
    assert.equal(
        normalizeUsageAnswer('  The weather   is gradually becoming warmer.  '),
        'the weather is gradually becoming warmer'
    );
});

test('treats case spacing and final punctuation differences as equivalent', () => {
    assert.equal(isEquivalentUsageAnswer(
        'The weather is gradually becoming warmer.',
        ['the weather  is gradually becoming warmer']
    ), true);

    assert.equal(isEquivalentUsageAnswer(
        'He has a negative attitude towards the exam!',
        ['He has a negative attitude towards the exam']
    ), true);
});

test('does not treat different usage answers as equivalent', () => {
    assert.equal(isEquivalentUsageAnswer(
        'Please draw a circle form on this paper.',
        ['Please draw a circle in this form.']
    ), false);
});
