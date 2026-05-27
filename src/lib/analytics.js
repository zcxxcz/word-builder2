import { supabase } from './supabase';
import { getToday } from '../utils/srs';

const ALLOWED_EVENT_NAMES = new Set([
    'study_session_started',
    'study_session_completed',
    'recall_failed',
    'spelling_failed',
    'usage_failed',
    'usage_skipped',
]);

const ALLOWED_METADATA_KEYS = new Set([
    'session_type',
    'review_count',
    'new_count',
    'duration_seconds',
    'spelling_accuracy',
    'level_ups',
    'hardest_word',
    'word',
    'phase',
    'step',
    'reason',
]);

function sanitizeMetadata(metadata = {}) {
    const safe = {};

    for (const [key, value] of Object.entries(metadata)) {
        if (!ALLOWED_METADATA_KEYS.has(key)) continue;
        if (value === null || value === undefined) continue;

        const valueType = typeof value;
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
            safe[key] = value;
        }
    }

    return safe;
}

export async function recordAnalyticsEvent(eventName, metadata = {}, userIdOverride) {
    try {
        if (!ALLOWED_EVENT_NAMES.has(eventName)) return;

        let userId = userIdOverride;
        if (!userId) {
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id;
        }

        if (!userId) return;

        await supabase.from('analytics_events').insert({
            user_id: userId,
            event_name: eventName,
            event_date: getToday(),
            metadata: sanitizeMetadata(metadata),
        });
    } catch {
        // Analytics must never interrupt the learning flow.
    }
}
