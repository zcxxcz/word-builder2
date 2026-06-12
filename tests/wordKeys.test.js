import assert from 'node:assert/strict';
import test from 'node:test';

import { expandWordKeyVariants, normalizeWordKey } from '../src/utils/wordKeys.js';

test('normalizes word keys to trimmed lowercase', () => {
    assert.equal(normalizeWordKey('  Monday '), 'monday');
    assert.equal(normalizeWordKey(undefined), '');
});

test('expands keys into lowercase, capitalized and uppercase variants', () => {
    const variants = expandWordKeyVariants(['monday']);

    assert.ok(variants.includes('monday'));
    assert.ok(variants.includes('Monday'));
    assert.ok(variants.includes('MONDAY'));
});

test('deduplicates variants and skips empty keys', () => {
    const variants = expandWordKeyVariants(['Monday', 'MONDAY', '', null, 'tv']);

    assert.equal(variants.filter(v => v.toLowerCase() === 'monday').length, 3);
    assert.ok(variants.includes('TV'));
    assert.ok(variants.includes('tv'));
});
