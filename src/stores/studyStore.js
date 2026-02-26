import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { PHASE, STEP } from '../utils/constants';
import { calculateLevelUpdate, getNextReviewDate, getToday, shuffle } from '../utils/srs';

export const useStudyStore = create((set, get) => ({
    // Queue state
    phase: null,           // current phase: review, new_learn, new_review, relapse, complete
    step: null,            // current step: recall or spelling
    currentWord: null,     // current word object
    queue: [],             // remaining words in current sub-queue

    // Session tracking
    reviewWords: [],
    newWords: [],
    relapseWords: [],

    // Current phase sub-queues (for A-then-B pattern)
    stepAQueue: [],
    stepBQueue: [],

    // Results tracking
    sessionResults: {
        startTime: null,
        newCount: 0,
        reviewCount: 0,
        spellingCorrect: 0,
        spellingTotal: 0,
        recallKnow: 0,
        recallDontKnow: 0,
        levelUps: 0,
        wordErrors: {},     // { word: errorCount }
    },

    // Per-word tracking for current phase
    wordPhaseResults: {},  // { word: { recallPassed, spellingPassed } }

    // Session state  
    isActive: false,
    showAnswer: false,
    spellingResult: null,  // null, 'correct', 'incorrect'
    correctSpelling: '',
    needsCorrection: false,
    correctionDone: false,

    /**
     * Initialize a study session with pre-generated queues
     */
    startSession: (reviewWords, newWords) => {
        set({
            reviewWords,
            newWords,
            relapseWords: [],
            isActive: true,
            sessionResults: {
                startTime: Date.now(),
                newCount: newWords.length,
                reviewCount: reviewWords.length,
                spellingCorrect: 0,
                spellingTotal: 0,
                recallKnow: 0,
                recallDontKnow: 0,
                levelUps: 0,
                wordErrors: {},
            },
            wordPhaseResults: {},
        });

        // Start with review phase if there are review words
        if (reviewWords.length > 0) {
            get().startPhase(PHASE.REVIEW, reviewWords);
        } else if (newWords.length > 0) {
            get().startPhase(PHASE.NEW_LEARN, newWords);
        } else {
            set({ phase: PHASE.COMPLETE, isActive: false });
        }
    },

    /**
     * Start a phase (review, new_learn, new_review, relapse)
     */
    startPhase: (phase, words) => {
        if (words.length === 0) {
            get().advancePhase();
            return;
        }

        if (phase === PHASE.NEW_LEARN) {
            // New learning: each word does A then B sequentially
            // We interleave: word1-A, word1-B, word2-A, word2-B, ...
            const queue = [];
            for (const w of words) {
                queue.push({ ...w, _step: STEP.RECALL });
                queue.push({ ...w, _step: STEP.SPELLING });
            }
            set({
                phase,
                queue: queue.slice(1),
                currentWord: queue[0],
                step: queue[0]._step,
                wordPhaseResults: {},
                showAnswer: false,
                spellingResult: null,
                needsCorrection: false,
                correctionDone: false,
            });
        } else {
            // Review/new_review/relapse: all Step A first, then all Step B
            const shuffled = shuffle(words);
            const stepAQueue = shuffled.map(w => ({ ...w, _step: STEP.RECALL }));
            const stepBQueue = shuffle(words).map(w => ({ ...w, _step: STEP.SPELLING }));

            const fullQueue = [...stepAQueue, ...stepBQueue];
            set({
                phase,
                queue: fullQueue.slice(1),
                stepAQueue: stepAQueue.slice(1),
                stepBQueue,
                currentWord: fullQueue[0],
                step: fullQueue[0]._step,
                wordPhaseResults: {},
                showAnswer: false,
                spellingResult: null,
                needsCorrection: false,
                correctionDone: false,
            });
        }
    },

    /**
     * Show the answer for recall step
     */
    revealAnswer: () => {
        set({ showAnswer: true });
        console.log('show_answer');
    },

    /**
     * Submit self-evaluation for recall step
     */
    submitRecall: (know) => {
        const { currentWord, sessionResults, wordPhaseResults } = get();
        const wordKey = currentWord.word.toLowerCase();

        const newResults = { ...sessionResults };
        if (know) {
            newResults.recallKnow++;
        } else {
            newResults.recallDontKnow++;
            // Add to relapse
            get().addToRelapse(currentWord);
        }

        const newWordResults = { ...wordPhaseResults };
        if (!newWordResults[wordKey]) newWordResults[wordKey] = {};
        newWordResults[wordKey].recallPassed = know;

        set({
            sessionResults: newResults,
            wordPhaseResults: newWordResults,
        });

        console.log('self_eval', { choice: know ? 'know' : 'dont_know' });
        get().advanceWord();
    },

    /**
     * Submit spelling attempt
     */
    submitSpelling: (input) => {
        const { currentWord, sessionResults, wordPhaseResults, needsCorrection } = get();
        const wordKey = currentWord.word.toLowerCase();
        const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();

        if (needsCorrection) {
            // This is a correction attempt
            if (isCorrect) {
                set({ correctionDone: true, spellingResult: 'corrected' });
            } else {
                set({ spellingResult: 'incorrect' });
            }
            return;
        }

        const newResults = { ...sessionResults };
        newResults.spellingTotal++;

        if (isCorrect) {
            newResults.spellingCorrect++;
            set({
                spellingResult: 'correct',
                sessionResults: newResults,
            });

            const newWordResults = { ...wordPhaseResults };
            if (!newWordResults[wordKey]) newWordResults[wordKey] = {};
            newWordResults[wordKey].spellingPassed = true;
            set({ wordPhaseResults: newWordResults });

            console.log('spelling_submit', { correct: true });
        } else {
            set({
                spellingResult: 'incorrect',
                correctSpelling: currentWord.word,
                needsCorrection: true,
                sessionResults: newResults,
            });

            const newWordResults = { ...wordPhaseResults };
            if (!newWordResults[wordKey]) newWordResults[wordKey] = {};
            newWordResults[wordKey].spellingPassed = false;
            set({ wordPhaseResults: newWordResults });

            // Add to relapse
            get().addToRelapse(currentWord);

            if (!newResults.wordErrors[wordKey]) {
                newResults.wordErrors[wordKey] = 0;
            }
            newResults.wordErrors[wordKey]++;
            set({ sessionResults: newResults });

            console.log('spelling_submit', { correct: false });
        }
    },

    /**
     * Proceed after spelling (called when user clicks next or after correction)
     */
    proceedAfterSpelling: () => {
        get().advanceWord();
    },

    /**
     * Add word to relapse queue
     */
    addToRelapse: (word) => {
        const { relapseWords } = get();
        const exists = relapseWords.some(w => w.word.toLowerCase() === word.word.toLowerCase());
        if (!exists) {
            set({ relapseWords: [...relapseWords, word] });
        }
    },

    /**
     * Advance to next word in queue
     */
    advanceWord: () => {
        const { queue } = get();

        if (queue.length === 0) {
            // Current phase sub-queue exhausted, try to update levels and advance phase
            get().finishCurrentPhase();
            return;
        }

        const next = queue[0];
        set({
            queue: queue.slice(1),
            currentWord: next,
            step: next._step,
            showAnswer: false,
            spellingResult: null,
            needsCorrection: false,
            correctionDone: false,
        });
    },

    /**
     * Finish current phase: update word levels and move to next phase
     */
    finishCurrentPhase: async () => {
        const { phase, wordPhaseResults, sessionResults } = get();
        const state = get();

        // Update levels for words that were reviewed (both A and B completed)
        if (phase !== PHASE.NEW_LEARN) {
            const userId = (await supabase.auth.getUser()).data.user?.id;
            if (userId) {
                let levelUps = sessionResults.levelUps;

                for (const [wordKey, results] of Object.entries(wordPhaseResults)) {
                    if (results.recallPassed !== undefined && results.spellingPassed !== undefined) {
                        // Both steps completed, update level
                        const { data: existing } = await supabase
                            .from('user_word_state')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('word', wordKey)
                            .single();

                        const currentState = existing || { level: 0, wrong_count: 0, correct_streak: 0 };
                        const updates = calculateLevelUpdate(
                            currentState,
                            results.recallPassed,
                            results.spellingPassed
                        );

                        if (updates.level > currentState.level) {
                            levelUps++;
                        }

                        await supabase.from('user_word_state').upsert({
                            user_id: userId,
                            word: wordKey,
                            ...updates,
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'user_id,word' });
                    }
                }

                set({ sessionResults: { ...sessionResults, levelUps } });
            }
        }

        get().advancePhase();
    },

    /**
     * Advance to next phase
     */
    advancePhase: () => {
        const { phase, newWords, relapseWords } = get();
        const settings = get().sessionSettings || {};

        if (phase === PHASE.REVIEW) {
            if (newWords.length > 0) {
                get().startPhase(PHASE.NEW_LEARN, newWords);
            } else if (relapseWords.length > 0) {
                get().startPhase(PHASE.RELAPSE, relapseWords.slice(0, settings.relapse_cap || 10));
            } else {
                get().completeSession();
            }
        } else if (phase === PHASE.NEW_LEARN) {
            // After new learning, create initial word states
            get().createInitialWordStates().then(() => {
                // Auto-review new words
                if (newWords.length > 0) {
                    get().startPhase(PHASE.NEW_REVIEW, newWords);
                } else {
                    get().advancePhase();
                }
            });
        } else if (phase === PHASE.NEW_REVIEW) {
            if (relapseWords.length > 0) {
                const { relapse_cap = 10 } = settings;
                get().startPhase(PHASE.RELAPSE, relapseWords.slice(0, relapse_cap));
            } else {
                get().completeSession();
            }
        } else if (phase === PHASE.RELAPSE) {
            get().completeSession();
        } else {
            get().completeSession();
        }
    },

    /**
     * Create initial word states for newly learned words (L0)
     */
    createInitialWordStates: async () => {
        const { newWords } = get();
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId || newWords.length === 0) return;

        for (const word of newWords) {
            const wordKey = word.word.toLowerCase();
            const { data: existing } = await supabase
                .from('user_word_state')
                .select('id')
                .eq('user_id', userId)
                .eq('word', wordKey)
                .single();

            if (!existing) {
                await supabase.from('user_word_state').insert({
                    user_id: userId,
                    word: wordKey,
                    level: 0,
                    next_review_at: getNextReviewDate(0),
                    last_seen_at: new Date().toISOString(),
                    wrong_count: 0,
                    correct_streak: 0,
                });
            }
        }
    },

    /**
     * Complete the session and save record
     */
    completeSession: async () => {
        const { sessionResults } = get();
        const userId = (await supabase.auth.getUser()).data.user?.id;

        const duration = Math.round((Date.now() - sessionResults.startTime) / 1000);
        const accuracy = sessionResults.spellingTotal > 0
            ? sessionResults.spellingCorrect / sessionResults.spellingTotal
            : 1;

        // Find hardest word
        let hardestWord = '';
        let maxErrors = 0;
        for (const [word, count] of Object.entries(sessionResults.wordErrors)) {
            if (count > maxErrors) {
                maxErrors = count;
                hardestWord = word;
            }
        }

        const sessionRecord = {
            user_id: userId,
            date: getToday(),
            type: 'all',
            new_count: sessionResults.newCount,
            review_count: sessionResults.reviewCount,
            spelling_accuracy: Math.round(accuracy * 100) / 100,
            self_eval_stats: {
                know: sessionResults.recallKnow,
                dont_know: sessionResults.recallDontKnow,
            },
            duration_seconds: duration,
            hardest_word: hardestWord,
            level_ups: sessionResults.levelUps,
        };

        if (userId) {
            await supabase.from('sessions').insert(sessionRecord);
        }

        set({
            phase: PHASE.COMPLETE,
            isActive: false,
        });

        console.log('session_complete', sessionRecord);
    },

    /**
     * Store session settings reference
     */
    setSessionSettings: (settings) => {
        set({ sessionSettings: settings });
    },

    /**
     * Reset session
     */
    resetSession: () => {
        set({
            phase: null,
            step: null,
            currentWord: null,
            queue: [],
            reviewWords: [],
            newWords: [],
            relapseWords: [],
            stepAQueue: [],
            stepBQueue: [],
            sessionResults: {
                startTime: null,
                newCount: 0,
                reviewCount: 0,
                spellingCorrect: 0,
                spellingTotal: 0,
                recallKnow: 0,
                recallDontKnow: 0,
                levelUps: 0,
                wordErrors: {},
            },
            wordPhaseResults: {},
            isActive: false,
            showAnswer: false,
            spellingResult: null,
            correctSpelling: '',
            needsCorrection: false,
            correctionDone: false,
        });
    },

    /**
     * Get total remaining items (for progress display)
     */
    getTotalItems: () => {
        const { reviewWords, newWords } = get();
        // Review: all words × 2 steps, New: each word × 2 steps (learn) + all × 2 steps (review)
        return (reviewWords.length * 2) + (newWords.length * 2) + (newWords.length * 2);
    },

    /**
     * Get completed items count  
     */
    getCompletedItems: () => {
        const state = get();
        const total = state.getTotalItems();
        const remaining = state.queue.length + 1; // +1 for current
        return Math.max(0, total - remaining);
    },
}));
