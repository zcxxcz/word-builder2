export const USAGE_VARIANT_COUNT = 2;
export const DEFAULT_USAGE_VARIANT_INDEX = 0;
export const USAGE_SCENE_MODE = {
    ROTATE: 'rotate',
    FIXED_A: 'fixed_a',
};

export function normalizeUsageVariantIndex(value) {
    const index = Number(value);
    if (!Number.isInteger(index)) return DEFAULT_USAGE_VARIANT_INDEX;
    return index >= 0 && index < USAGE_VARIANT_COUNT ? index : DEFAULT_USAGE_VARIANT_INDEX;
}

export function getNextUsageVariantIndex(value) {
    return (normalizeUsageVariantIndex(value) + 1) % USAGE_VARIANT_COUNT;
}

export function normalizeUsageSceneMode(value) {
    return value === USAGE_SCENE_MODE.FIXED_A
        ? USAGE_SCENE_MODE.FIXED_A
        : USAGE_SCENE_MODE.ROTATE;
}

export function getTargetUsageVariantIndex(nextVariantIndex, sceneMode) {
    return normalizeUsageSceneMode(sceneMode) === USAGE_SCENE_MODE.FIXED_A
        ? DEFAULT_USAGE_VARIANT_INDEX
        : normalizeUsageVariantIndex(nextVariantIndex);
}

export function shouldAdvanceUsageVariant(sceneMode) {
    return normalizeUsageSceneMode(sceneMode) === USAGE_SCENE_MODE.ROTATE;
}

export function getVariantLabel(value) {
    return normalizeUsageVariantIndex(value) === 0 ? 'A' : 'B';
}

export function withDefaultVariant(exercise) {
    return {
        ...exercise,
        variant_index: normalizeUsageVariantIndex(exercise?.variant_index),
    };
}

export function findValidExerciseForVariant(exercises, variantIndex, isValid) {
    const targetVariant = normalizeUsageVariantIndex(variantIndex);
    return (exercises || [])
        .map(withDefaultVariant)
        .find(exercise => exercise.variant_index === targetVariant && isValid(exercise));
}

export function chooseUsageExercise(exercises, preferredVariantIndex, isValid) {
    const preferredVariant = normalizeUsageVariantIndex(preferredVariantIndex);
    const fallbackVariant = getNextUsageVariantIndex(preferredVariant);
    const preferred = findValidExerciseForVariant(exercises, preferredVariant, isValid);

    if (preferred) {
        return {
            exercise: preferred,
            variant_index: preferred.variant_index,
            usedFallback: false,
        };
    }

    const fallback = findValidExerciseForVariant(exercises, fallbackVariant, isValid);
    if (fallback) {
        return {
            exercise: fallback,
            variant_index: fallback.variant_index,
            usedFallback: true,
        };
    }

    return {
        exercise: null,
        variant_index: preferredVariant,
        usedFallback: false,
    };
}
