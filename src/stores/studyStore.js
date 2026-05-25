import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { PHASE, STEP } from '../utils/constants';
import { calculateLevelUpdate, getNextReviewDate, getToday, shuffle } from '../utils/srs';

const FULL_REVIEW_STEPS = [STEP.RECALL, STEP.SPELLING, STEP.USAGE];

function normalizeRelapseSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
        return [...FULL_REVIEW_STEPS];
    }

    const allowed = new Set(FULL_REVIEW_STEPS);
    const requested = new Set(steps.filter(step => allowed.has(step)));
    const normalized = FULL_REVIEW_STEPS.filter(step => requested.has(step));
    return normalized.length > 0 ? normalized : [...FULL_REVIEW_STEPS];
}

function mergeRelapseSteps(existingSteps, incomingSteps) {
    const merged = new Set([
        ...normalizeRelapseSteps(existingSteps),
        ...normalizeRelapseSteps(incomingSteps),
    ]);
    return FULL_REVIEW_STEPS.filter(step => merged.has(step));
}

function upsertRelapseWord(relapseWords, word, relapseSteps) {
    const wordKey = word.word.toLowerCase();
    const normalizedSteps = normalizeRelapseSteps(relapseSteps);
    const existingIndex = relapseWords.findIndex(w => w.word.toLowerCase() === wordKey);

    if (existingIndex === -1) {
        return [...relapseWords, { ...word, _relapseSteps: normalizedSteps }];
    }

    return relapseWords.map((w, index) => {
        if (index !== existingIndex) return w;
        return {
            ...w,
            _relapseSteps: mergeRelapseSteps(w._relapseSteps, normalizedSteps),
        };
    });
}

function mergeRelapseWords(relapseWords, wordsToAdd) {
    return wordsToAdd.reduce(
        (merged, word) => upsertRelapseWord(merged, word, word._relapseSteps),
        relapseWords
    );
}

function getPhaseRelapseWords(words, wordPhaseResults) {
    return words.reduce((relapseWords, word) => {
        const wordKey = word.word.toLowerCase();
        const results = wordPhaseResults[wordKey];
        if (!results) return relapseWords;

        const hasFailed = results.recallPassed === false ||
            results.spellingPassed === false ||
            results.usagePassed === false;
        if (!hasFailed) return relapseWords;

        const relapseSteps = results.recallPassed === true &&
            results.spellingPassed === true &&
            results.usagePassed === false
            ? [STEP.USAGE]
            : FULL_REVIEW_STEPS;

        return upsertRelapseWord(relapseWords, word, relapseSteps);
    }, []);
}

function getRelapseItemCount(relapseWords, relapseCap) {
    return relapseWords
        .slice(0, relapseCap)
        .reduce((total, word) => total + normalizeRelapseSteps(word._relapseSteps).length, 0);
}

const emptySessionResults = {
    startTime: null,
    newCount: 0,
    reviewCount: 0,
    spellingCorrect: 0,
    spellingTotal: 0,
    recallKnow: 0,
    recallDontKnow: 0,
    usagePassed: 0,
    usageTotal: 0,
    usageSkipped: 0,
    levelUps: 0,
    wordErrors: {},
};

export const useStudyStore = create(persist((set, get) => ({
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
    stepCQueue: [],

    // Results tracking
    sessionResults: {
        startTime: null,
        newCount: 0,
        reviewCount: 0,
        spellingCorrect: 0,
        spellingTotal: 0,
        recallKnow: 0,
        recallDontKnow: 0,
        usagePassed: 0,
        usageTotal: 0,
        usageSkipped: 0,
        levelUps: 0,
        wordErrors: {},     // { word: errorCount }
    },

    // Per-word tracking for current phase
    wordPhaseResults: {},  // { word: { recallPassed, spellingPassed, usagePassed } }

    // Session state  
    isActive: false,
    sessionUserId: null,
    sessionType: null,
    showAnswer: false,
    spellingResult: null,  // null, 'correct', 'incorrect'
    correctSpelling: '',
    needsCorrection: false,
    correctionDone: false,

    /**
     * Initialize a study session with pre-generated queues
     */
    startSession: (reviewWords, newWords, userId, sessionType = 'all') => {
        set({
            reviewWords,
            newWords,
            relapseWords: [],
            isActive: true,
            sessionUserId: userId,
            sessionType,
            sessionResults: {
                startTime: Date.now(),
                newCount: newWords.length,
                reviewCount: reviewWords.length,
                spellingCorrect: 0,
                spellingTotal: 0,
                recallKnow: 0,
                recallDontKnow: 0,
                usagePassed: 0,
                usageTotal: 0,
                usageSkipped: 0,
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
            set({ phase: PHASE.COMPLETE, isActive: false, sessionUserId: null });
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
                stepAQueue: [],
                stepBQueue: [],
                stepCQueue: [],
                wordPhaseResults: {},
                showAnswer: false,
                spellingResult: null,
                needsCorrection: false,
                correctionDone: false,
            });
        } else {
            // Review/new_review/relapse: all Step A, then B, then usage application.
            const wordsForStep = (step) => {
                if (phase !== PHASE.RELAPSE) return words;
                return words.filter(w => normalizeRelapseSteps(w._relapseSteps).includes(step));
            };

            const stepAQueue = shuffle(wordsForStep(STEP.RECALL)).map(w => ({ ...w, _step: STEP.RECALL }));
            const stepBQueue = shuffle(wordsForStep(STEP.SPELLING)).map(w => ({ ...w, _step: STEP.SPELLING }));
            const stepCQueue = shuffle(wordsForStep(STEP.USAGE)).map(w => ({ ...w, _step: STEP.USAGE }));

            const fullQueue = [...stepAQueue, ...stepBQueue, ...stepCQueue];
            const seededWordResults = {};

            if (phase === PHASE.RELAPSE) {
                for (const word of words) {
                    const steps = normalizeRelapseSteps(word._relapseSteps);
                    const wordKey = word.word.toLowerCase();
                    seededWordResults[wordKey] = {};
                    if (!steps.includes(STEP.RECALL)) seededWordResults[wordKey].recallPassed = true;
                    if (!steps.includes(STEP.SPELLING)) seededWordResults[wordKey].spellingPassed = true;
                }
            }

            if (fullQueue.length === 0) {
                get().advancePhase();
                return;
            }

            set({
                phase,
                queue: fullQueue.slice(1),
                stepAQueue: stepAQueue.slice(1),
                stepBQueue,
                stepCQueue,
                currentWord: fullQueue[0],
                step: fullQueue[0]._step,
                wordPhaseResults: seededWordResults,
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
     * Submit AI-graded usage application result.
     */
    submitUsage: (passed) => {
        const { currentWord, sessionResults, wordPhaseResults } = get();
        const wordKey = currentWord.word.toLowerCase();
        const newResults = { ...sessionResults };

        newResults.usageTotal++;
        if (passed) {
            newResults.usagePassed++;
        } else {
            const currentPhaseResults = wordPhaseResults[wordKey] || {};
            const relapseSteps = currentPhaseResults.recallPassed === true && currentPhaseResults.spellingPassed === true
                ? [STEP.USAGE]
                : FULL_REVIEW_STEPS;
            get().addToRelapse(currentWord, relapseSteps);
            if (!newResults.wordErrors[wordKey]) {
                newResults.wordErrors[wordKey] = 0;
            }
            newResults.wordErrors[wordKey]++;
        }

        const newWordResults = { ...wordPhaseResults };
        if (!newWordResults[wordKey]) newWordResults[wordKey] = {};
        newWordResults[wordKey].usagePassed = passed;

        set({
            sessionResults: newResults,
            wordPhaseResults: newWordResults,
        });

        console.log('usage_submit', { correct: passed });
        get().advanceWord();
    },

    /**
     * Skip usage application when AI generation/grading is unavailable.
     */
    skipUsage: () => {
        const { currentWord, sessionResults, wordPhaseResults } = get();
        const wordKey = currentWord.word.toLowerCase();

        const newWordResults = { ...wordPhaseResults };
        if (!newWordResults[wordKey]) newWordResults[wordKey] = {};
        newWordResults[wordKey].usageSkipped = true;

        set({
            sessionResults: {
                ...sessionResults,
                usageSkipped: sessionResults.usageSkipped + 1,
            },
            wordPhaseResults: newWordResults,
        });

        console.log('usage_skip');
        get().advanceWord();
    },

    /**
     * Add word to relapse queue
     */
    addToRelapse: (word, relapseSteps = FULL_REVIEW_STEPS) => {
        const { relapseWords } = get();
        set({ relapseWords: upsertRelapseWord(relapseWords, word, relapseSteps) });
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

        // Update levels for words that were reviewed (A, B, and usage completed).
        if (phase !== PHASE.NEW_LEARN) {
            const userId = (await supabase.auth.getUser()).data.user?.id;
            if (userId) {
                let levelUps = sessionResults.levelUps;

                for (const [wordKey, results] of Object.entries(wordPhaseResults)) {
                    if (
                        results.recallPassed !== undefined &&
                        results.spellingPassed !== undefined &&
                        results.usagePassed !== undefined
                    ) {
                        // All three steps completed, update level.
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
                            results.spellingPassed,
                            results.usagePassed
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
        const { phase, reviewWords, newWords, relapseWords, sessionType, wordPhaseResults } = get();
        const settings = get().sessionSettings || {};
        let effectiveRelapseWords = relapseWords;

        if (phase === PHASE.REVIEW || phase === PHASE.NEW_REVIEW) {
            const phaseWords = phase === PHASE.REVIEW ? reviewWords : newWords;
            effectiveRelapseWords = mergeRelapseWords(
                relapseWords,
                getPhaseRelapseWords(phaseWords, wordPhaseResults)
            );
            set({ relapseWords: effectiveRelapseWords });
        }

        if (phase === PHASE.REVIEW) {
            if (sessionType !== 'review' && newWords.length > 0) {
                get().startPhase(PHASE.NEW_LEARN, newWords);
            } else if (effectiveRelapseWords.length > 0) {
                get().startPhase(PHASE.RELAPSE, effectiveRelapseWords.slice(0, settings.relapse_cap || 10));
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
            if (effectiveRelapseWords.length > 0) {
                const { relapse_cap = 10 } = settings;
                get().startPhase(PHASE.RELAPSE, effectiveRelapseWords.slice(0, relapse_cap));
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
        const { sessionResults, sessionType } = get();
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
            type: sessionType || 'all',
            new_count: sessionResults.newCount,
            review_count: sessionResults.reviewCount,
            spelling_accuracy: Math.round(accuracy * 100) / 100,
            self_eval_stats: {
                know: sessionResults.recallKnow,
                dont_know: sessionResults.recallDontKnow,
                usage: {
                    passed: sessionResults.usagePassed,
                    total: sessionResults.usageTotal,
                    skipped: sessionResults.usageSkipped,
                },
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
            sessionUserId: null,
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
            stepCQueue: [],
            sessionResults: {
                startTime: null,
                newCount: 0,
                reviewCount: 0,
                spellingCorrect: 0,
                spellingTotal: 0,
                recallKnow: 0,
                recallDontKnow: 0,
                usagePassed: 0,
                usageTotal: 0,
                usageSkipped: 0,
                levelUps: 0,
                wordErrors: {},
            },
            wordPhaseResults: {},
            isActive: false,
            sessionUserId: null,
            sessionType: null,
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
        const { reviewWords, newWords, relapseWords } = get();
        const settings = get().sessionSettings || {};
        const relapseItemCount = getRelapseItemCount(relapseWords, settings.relapse_cap || 10);
        // Review/relapse: 3 steps. New: 2 learning steps + 3 review steps.
        return (reviewWords.length * 3) + (newWords.length * 5) + relapseItemCount;
    },

    /**
     * Get completed items count  
     */
    getCompletedItems: () => {
        const state = get();
        const total = state.getTotalItems();
        const currentRemaining = state.currentWord ? state.queue.length + 1 : 0;
        const settings = state.sessionSettings || {};
        const relapseItemCount = getRelapseItemCount(state.relapseWords, settings.relapse_cap || 10);

        let futureRemaining = 0;
        if (state.phase === PHASE.REVIEW) {
            futureRemaining = (state.newWords.length * 5) + relapseItemCount;
        } else if (state.phase === PHASE.NEW_LEARN) {
            futureRemaining = (state.newWords.length * 3) + relapseItemCount;
        } else if (state.phase === PHASE.NEW_REVIEW) {
            futureRemaining = relapseItemCount;
        }

        return Math.max(0, total - currentRemaining - futureRemaining);
    },
}), {
    name: 'word-builder-active-study-session',
    partialize: (state) => ({
        phase: state.phase,
        step: state.step,
        currentWord: state.currentWord,
        queue: state.queue,
        reviewWords: state.reviewWords,
        newWords: state.newWords,
        relapseWords: state.relapseWords,
        stepAQueue: state.stepAQueue,
        stepBQueue: state.stepBQueue,
        stepCQueue: state.stepCQueue,
        sessionResults: state.sessionResults,
        wordPhaseResults: state.wordPhaseResults,
        isActive: state.isActive,
        sessionUserId: state.sessionUserId,
        sessionType: state.sessionType,
        showAnswer: state.showAnswer,
        spellingResult: state.spellingResult,
        correctSpelling: state.correctSpelling,
        needsCorrection: state.needsCorrection,
        correctionDone: state.correctionDone,
        sessionSettings: state.sessionSettings,
    }),
    merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        sessionResults: {
            ...emptySessionResults,
            ...(persistedState?.sessionResults || {}),
        },
        wordPhaseResults: persistedState?.wordPhaseResults || {},
    }),
}));
