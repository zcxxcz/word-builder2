import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isMissingOnConflictConstraintError,
    upsertUsageExerciseWithClient,
} from '../src/utils/usageExerciseCacheCore.js';

const missingConstraintError = {
    message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
};

function makeAwaitable(result, calls, method, payload = {}) {
    const filters = [];
    const chain = {
        eq(column, value) {
            filters.push({ column, value });
            return chain;
        },
        maybeSingle() {
            calls.push({ method: 'maybeSingle', filters });
            return Promise.resolve(result);
        },
        then(resolve, reject) {
            calls.push({ method, filters, ...payload });
            return Promise.resolve(result).then(resolve, reject);
        },
    };
    return chain;
}

function makeFakeClient({ upsertError, existingRow }) {
    const calls = [];

    return {
        calls,
        from(table) {
            return {
                upsert(row, options) {
                    calls.push({ method: 'upsert', table, row, options });
                    return Promise.resolve({ error: upsertError || null });
                },
                select(columns) {
                    calls.push({ method: 'select', table, columns });
                    return makeAwaitable({ data: existingRow || null, error: null }, calls, 'select');
                },
                update(row) {
                    calls.push({ method: 'update', table, row });
                    return makeAwaitable({ error: null }, calls, 'updateAwait');
                },
                insert(row) {
                    calls.push({ method: 'insert', table, row });
                    return Promise.resolve({ error: null });
                },
            };
        },
    };
}

test('detects missing ON CONFLICT unique constraint errors', () => {
    assert.equal(isMissingOnConflictConstraintError(missingConstraintError), true);
    assert.equal(isMissingOnConflictConstraintError({ message: 'network failed' }), false);
});

test('falls back to update when ON CONFLICT constraint is missing and a row exists', async () => {
    const client = makeFakeClient({
        upsertError: missingConstraintError,
        existingRow: { id: 'exercise-1' },
    });

    await upsertUsageExerciseWithClient({
        userId: 'user-1',
        word: 'Boost',
        meaningCn: '提高;促进;增强',
        variantIndex: 1,
        promptCn: '喝牛奶可以增强你的体力。',
        referenceAnswerEn: 'Drinking milk can boost your energy.',
    }, client);

    assert.equal(client.calls[0].method, 'upsert');
    assert.equal(client.calls[0].options.onConflict, 'user_id,word,meaning_cn,variant_index');
    assert.equal(client.calls[0].row.word, 'boost');
    assert.equal(client.calls.some(call => call.method === 'update'), true);
    assert.equal(client.calls.some(call => call.method === 'insert'), false);
});

test('falls back to insert when ON CONFLICT constraint is missing and no row exists', async () => {
    const client = makeFakeClient({
        upsertError: missingConstraintError,
        existingRow: null,
    });

    await upsertUsageExerciseWithClient({
        userId: 'user-1',
        word: 'Boost',
        meaningCn: '提高;促进;增强',
        variantIndex: 1,
        promptCn: '喝牛奶可以增强你的体力。',
        referenceAnswerEn: 'Drinking milk can boost your energy.',
    }, client);

    assert.equal(client.calls.some(call => call.method === 'update'), false);
    assert.equal(client.calls.some(call => call.method === 'insert'), true);
});
