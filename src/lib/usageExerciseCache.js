import { supabase } from './supabase';
import {
    isMissingOnConflictConstraintError,
    upsertUsageExerciseWithClient,
} from '../utils/usageExerciseCacheCore';

export { isMissingOnConflictConstraintError };

export function upsertUsageExercise(input, client = supabase) {
    return upsertUsageExerciseWithClient(input, client);
}
