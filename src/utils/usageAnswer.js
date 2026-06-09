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

export function normalizeUsageGradeResult({ answerEn, referenceAnswerEn, gradeData }) {
    const correctedAnswer = gradeData?.corrected_answer_en || referenceAnswerEn || '';
    const isEquivalent = isEquivalentUsageAnswer(answerEn, [
        referenceAnswerEn,
        correctedAnswer,
    ]);
    const passed = isEquivalent ? true : Boolean(gradeData?.passed);
    const parsedScore = Number(gradeData?.score || 0);
    const rawScore = Number.isFinite(parsedScore) ? parsedScore : 0;
    const score = Math.max(0, Math.min(1, isEquivalent ? 1 : passed ? Math.max(rawScore, 0.9) : rawScore));

    return {
        passed,
        score,
        feedback_cn: gradeData?.feedback_cn || '',
        corrected_answer_en: correctedAnswer,
    };
}
