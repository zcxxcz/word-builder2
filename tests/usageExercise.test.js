import assert from 'node:assert/strict';
import test from 'node:test';

import { getUsageDisplayMeaning, isValidUsageExercise } from '../src/utils/usageExercise.js';

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

test('accepts irregular past forms of the target verb in the reference', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '昨天我在公交车上丢失了我的钱包。',
        reference_answer_en: 'I lost my wallet on the bus yesterday.',
    }, {
        word: 'lose',
        meaningCn: '丢失；失去',
    }), true);

    assert.equal(isValidUsageExercise({
        prompt_cn: '上周我给妹妹买了一本故事书。',
        reference_answer_en: 'I bought a storybook for my sister last week.',
    }, {
        word: 'buy',
        meaningCn: '买',
    }), true);

    assert.equal(isValidUsageExercise({
        prompt_cn: '老师昨天教了我们一首英文歌。',
        reference_answer_en: 'The teacher taught us an English song yesterday.',
    }, {
        word: 'teach',
        meaningCn: '教',
    }), true);
});

test('accepts irregular plural forms of the target noun in the reference', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '公园里有很多孩子在玩耍。',
        reference_answer_en: 'There are many children playing in the park.',
    }, {
        word: 'child',
        meaningCn: '孩子',
    }), true);

    assert.equal(isValidUsageExercise({
        prompt_cn: '秋天的树叶变黄了。',
        reference_answer_en: 'The leaves turn yellow in autumn.',
    }, {
        word: 'leaf',
        meaningCn: '树叶',
    }), true);
});

test('still rejects references that use a different word entirely', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '昨天我在公交车上丢失了我的钱包。',
        reference_answer_en: 'I misplaced my wallet on the bus yesterday.',
    }, {
        word: 'lose',
        meaningCn: '丢失；失去',
    }), false);
});

test('rejects legacy question prompts paired with an answer reference', () => {
    // Real production case: faithful translation of the question can never
    // contain the target word, so the exercise is unanswerable as a
    // translation task and must be invalidated to trigger regeneration.
    assert.equal(isValidUsageExercise({
        prompt_cn: '你今年多少岁?',
        reference_answer_en: 'I am twelve years old.',
    }, {
        word: 'year',
        meaningCn: '年；年龄',
    }), false);
});

test('accepts question prompts paired with a question reference', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '你能帮助我完成这个作业吗？',
        reference_answer_en: 'Can you help me finish this homework?',
    }, {
        word: 'help',
        meaningCn: '帮助',
    }), true);
});

test('rejects statement prompts paired with a question reference', () => {
    assert.equal(isValidUsageExercise({
        prompt_cn: '我每天骑自行车上学。',
        reference_answer_en: 'How do you go to school every day?',
    }, {
        word: 'bicycle',
        meaningCn: '自行车',
    }), false);
});

test('display meaning skips entries without Chinese characters', () => {
    // Fallback meaning equals the English word when word data is missing;
    // it must not be sent to exercise generation as a "Chinese meaning".
    assert.equal(getUsageDisplayMeaning({ meaning_cn: 'monday' }), '');
    assert.equal(getUsageDisplayMeaning({ all_meanings: ['monday'], meaning_cn: 'monday' }), '');
    assert.equal(getUsageDisplayMeaning({ all_meanings: ['monday', '星期一'] }), '星期一');
    assert.equal(getUsageDisplayMeaning({ meaning_cn: '星期一' }), '星期一');
    assert.equal(getUsageDisplayMeaning({}), '');
});
