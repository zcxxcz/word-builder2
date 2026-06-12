export function normalizeUsageAnswer(answer) {
    return String(answer || '')
        .trim()
        .toLowerCase()
        .replace(/\s*([,;:])\s*/g, '$1')
        .replace(/\s+([.?!])/g, '$1')
        .replace(/\s+/g, ' ')
        .replace(/[.?!]+$/g, '')
        .trim();
}

export function isEquivalentUsageAnswer(answer, candidates) {
    const normalizedAnswer = normalizeUsageAnswer(answer);
    if (!normalizedAnswer) return false;

    return (candidates || []).some(candidate =>
        normalizeUsageAnswer(candidate) === normalizedAnswer
    );
}

function toGradeBool(value) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return null;
}

export function normalizeUsageGradeResult({ answerEn, referenceAnswerEn, gradeData }) {
    const correctedAnswer = gradeData?.corrected_answer_en || referenceAnswerEn || '';
    const isEquivalent = isEquivalentUsageAnswer(answerEn, [
        referenceAnswerEn,
        correctedAnswer,
    ]);

    // Structured verdict fields (newer grading prompt). When both are present,
    // passed must equal their conjunction; trust them over a contradictory
    // top-level passed so injection/format slips fail safe.
    const targetWordOk = toGradeBool(gradeData?.target_word_ok);
    const coreMeaningOk = toGradeBool(gradeData?.core_meaning_ok);
    let passed = Boolean(gradeData?.passed);
    if (targetWordOk !== null && coreMeaningOk !== null) {
        passed = targetWordOk && coreMeaningOk;
    }
    if (isEquivalent) passed = true;

    const parsedScore = Number(gradeData?.score || 0);
    const rawScore = Number.isFinite(parsedScore) ? parsedScore : 0;
    const score = Math.max(0, Math.min(1, isEquivalent ? 1 : passed ? Math.max(rawScore, 0.9) : Math.min(rawScore, 0.89)));

    return {
        passed,
        score,
        feedback_cn: gradeData?.feedback_cn || '',
        corrected_answer_en: correctedAnswer,
        main_issue: gradeData?.main_issue || '',
    };
}
