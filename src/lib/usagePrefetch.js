import { getUsageExercise } from './deepseek';
import { getUsageDisplayMeaning } from '../utils/usageExercise';

// Prefetch and the usage card must use the same meaning so both paths
// resolve the same cache entry.
export { getUsageDisplayMeaning };

// Share one in-flight request per word between background prefetch and the
// usage card, so a word never triggers duplicate AI generation. Failed
// requests are evicted immediately; consumed ones are evicted so the next
// encounter (e.g. a relapse round or the next session) re-resolves the
// rotated scene variant.
const inflight = new Map();

function keyFor(word, meaningCn, usageSceneMode) {
    return `${(word || '').trim().toLowerCase()}|${(meaningCn || '').trim()}|${usageSceneMode}`;
}

function fetchShared(word, meaningCn, usageSceneMode) {
    const key = keyFor(word, meaningCn, usageSceneMode);
    let entry = inflight.get(key);
    if (!entry) {
        entry = getUsageExercise(word, meaningCn, usageSceneMode);
        entry.catch(() => {
            if (inflight.get(key) === entry) inflight.delete(key);
        });
        inflight.set(key, entry);
    }
    return entry;
}

export function prefetchUsageExercise(word, meaningCn, usageSceneMode) {
    fetchShared(word, meaningCn, usageSceneMode).catch(() => {
        // Prefetch failures are silent; the usage card retries on its own.
    });
}

export function consumeUsageExercise(word, meaningCn, usageSceneMode) {
    const entry = fetchShared(word, meaningCn, usageSceneMode);
    inflight.delete(keyFor(word, meaningCn, usageSceneMode));
    return entry;
}
