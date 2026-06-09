import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isEquivalentUsageAnswer,
    normalizeUsageGradeResult,
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

test('treats punctuation spacing differences as equivalent', () => {
    assert.equal(isEquivalentUsageAnswer(
        'In the community charity sale,everybody donated many books and toys.',
        ['In the community charity sale, everybody donated many books and toys.']
    ), true);
});

test('does not treat different usage answers as equivalent', () => {
    assert.equal(isEquivalentUsageAnswer(
        'Please draw a circle form on this paper.',
        ['Please draw a circle in this form.']
    ), false);
});

test('forces equivalent usage answers to pass with full score', () => {
    assert.deepEqual(normalizeUsageGradeResult({
        answerEn: 'In the community charity sale,everybody donated many books and toys.',
        referenceAnswerEn: 'In the community charity sale, everybody donated many books and toys.',
        gradeData: {
            passed: true,
            score: 0.85,
            feedback_cn: '目标词使用正确。',
            corrected_answer_en: 'In the community charity sale, everybody donated many books and toys.',
        },
    }), {
        passed: true,
        score: 1,
        feedback_cn: '目标词使用正确。',
        corrected_answer_en: 'In the community charity sale, everybody donated many books and toys.',
    });
});

test('raises low passing usage scores to ninety percent', () => {
    const result = normalizeUsageGradeResult({
        answerEn: 'Many people donated books and toys at the community sale.',
        referenceAnswerEn: 'In the community charity sale, everybody donated many books and toys.',
        gradeData: {
            passed: true,
            score: 0.85,
            feedback_cn: '目标词使用正确。',
            corrected_answer_en: 'Everybody donated many books and toys at the charity sale.',
        },
    });

    assert.equal(result.passed, true);
    assert.equal(result.score, 0.9);
});

test('does not raise failing usage scores', () => {
    const result = normalizeUsageGradeResult({
        answerEn: 'Everybody gave many books and toys.',
        referenceAnswerEn: 'Everybody donated many books and toys.',
        gradeData: {
            passed: false,
            score: 0.6,
            feedback_cn: '目标词缺失。',
            corrected_answer_en: 'Everybody donated many books and toys.',
        },
    });

    assert.equal(result.passed, false);
    assert.equal(result.score, 0.6);
});
