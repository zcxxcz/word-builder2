export function normalizeUsageAnswer(answer) {
    return String(answer || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[.?!]+$/g, '')
        .trim()
        .toLowerCase();
}

export function isEquivalentUsageAnswer(answer, candidates) {
    const normalizedAnswer = normalizeUsageAnswer(answer);
    if (!normalizedAnswer) return false;

    return (candidates || []).some(candidate =>
        normalizeUsageAnswer(candidate) === normalizedAnswer
    );
}
