export function normalizeWordKey(word) {
    return String(word || '').trim().toLowerCase();
}

/**
 * Word state rows store lowercase keys, but built-in wordlists keep original
 * casing (Monday, Mr., TV...). DB IN-lookups are case-sensitive, so expand
 * each key into the casings a wordlist row may use.
 */
export function expandWordKeyVariants(words) {
    const variants = new Set();
    for (const word of words || []) {
        const key = normalizeWordKey(word);
        if (!key) continue;
        variants.add(key);
        variants.add(key.charAt(0).toUpperCase() + key.slice(1));
        variants.add(key.toUpperCase());
    }
    return [...variants];
}
