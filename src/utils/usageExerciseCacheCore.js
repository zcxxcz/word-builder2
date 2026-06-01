import { normalizeUsageVariantIndex } from './usageVariant.js';

export const USAGE_EXERCISE_CONFLICT_TARGET = 'user_id,word,meaning_cn,variant_index';

const ON_CONFLICT_MISSING_RE = /no unique or exclusion constraint matching the ON CONFLICT specification/i;

function normalizeWord(word) {
    return String(word || '').trim().toLowerCase();
}

export function isMissingOnConflictConstraintError(error) {
    const text = [
        error?.message,
        error?.details,
        error?.hint,
        error?.code,
    ].filter(Boolean).join(' ');
    return ON_CONFLICT_MISSING_RE.test(text);
}

function toCacheSaveError(error) {
    if (isMissingOnConflictConstraintError(error)) {
        return new Error('场景题缓存保存失败：数据库结构尚未完成，请重新执行 Supabase migration。');
    }
    return error;
}

function buildUsageExerciseRow(input) {
    return {
        user_id: input.user_id || input.userId,
        word: normalizeWord(input.word),
        meaning_cn: input.meaning_cn ?? input.meaningCn ?? '',
        variant_index: normalizeUsageVariantIndex(input.variant_index ?? input.variantIndex),
        prompt_cn: input.prompt_cn ?? input.promptCn ?? '',
        reference_answer_en: input.reference_answer_en ?? input.referenceAnswerEn ?? '',
        updated_at: input.updated_at || new Date().toISOString(),
    };
}

async function fallbackSaveUsageExercise(client, row) {
    const { data: existing, error: findError } = await client
        .from('user_usage_exercises')
        .select('id')
        .eq('user_id', row.user_id)
        .eq('word', row.word)
        .eq('meaning_cn', row.meaning_cn)
        .eq('variant_index', row.variant_index)
        .maybeSingle();

    if (findError) throw toCacheSaveError(findError);

    if (existing?.id) {
        const { error: updateError } = await client
            .from('user_usage_exercises')
            .update({
                prompt_cn: row.prompt_cn,
                reference_answer_en: row.reference_answer_en,
                updated_at: row.updated_at,
            })
            .eq('id', existing.id)
            .eq('user_id', row.user_id);

        if (updateError) throw toCacheSaveError(updateError);
        return;
    }

    const { error: insertError } = await client
        .from('user_usage_exercises')
        .insert(row);

    if (insertError) throw toCacheSaveError(insertError);
}

export async function upsertUsageExerciseWithClient(input, client) {
    const row = buildUsageExerciseRow(input);

    const { error } = await client
        .from('user_usage_exercises')
        .upsert(row, { onConflict: USAGE_EXERCISE_CONFLICT_TARGET });

    if (!error) return row;

    if (!isMissingOnConflictConstraintError(error)) {
        throw toCacheSaveError(error);
    }

    try {
        await fallbackSaveUsageExercise(client, row);
    } catch {
        throw new Error('场景题缓存保存失败：数据库结构尚未完成，请重新执行 Supabase migration。');
    }
    return row;
}
