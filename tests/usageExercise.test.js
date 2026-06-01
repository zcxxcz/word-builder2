import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidUsageExercise } from '../src/utils/usageExercise.js';

test('rejects gap-style question that hides the target meaning', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '她的什么帮助我们解决了这个问题？',
        reference_answer_en: 'Her insight helped us solve the problem.',
    }, {
        word: 'insight',
        meaningCn: '洞察力;深刻理解;领悟',
    }), false);
});

test('accepts a direct Chinese scene sentence with the target meaning', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '她的洞察力帮助我们解决了这个问题。',
        reference_answer_en: 'Her insight helped us solve the problem.',
    }, {
        word: 'insight',
        meaningCn: '洞察力;深刻理解;领悟',
    }), true);
});

test('accepts natural questions when the target meaning is explicit', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '你叫什么名字？',
        reference_answer_en: 'What is your name?',
    }, {
        word: 'name',
        meaningCn: '名字',
    }), true);
});

test('accepts gap words when the target meaning is explicit elsewhere', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '妈妈问我晚饭想吃什么，我说想吃一碗热腾腾的面条。',
        reference_answer_en: 'I want to eat a bowl of hot noodles.',
    }, {
        word: 'noodle',
        meaningCn: '面条',
    }), true);
});

test('accepts natural Chinese paraphrases of related meanings', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '他决定把旧书捐给图书馆。',
        reference_answer_en: 'He decided to donate old books to the library.',
    }, {
        word: 'donate',
        meaningCn: '捐赠;捐款;捐助',
    }), true);
});

test('rejects meta translation prompts', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '请将下面的英文句子翻译成中文：',
        reference_answer_en: 'The wild rabbit ran into the forest.',
    }, {
        word: 'wild',
        meaningCn: '野生的;狂野的;疯狂的',
    }), false);
});

test('rejects Chinese prompts that contain English text', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '这个 insight 很重要。',
        reference_answer_en: 'This insight is important.',
    }, {
        word: 'insight',
        meaningCn: '洞察力;深刻理解;领悟',
    }), false);
});
