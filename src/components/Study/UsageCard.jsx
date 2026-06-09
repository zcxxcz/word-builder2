import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askUsageQuestion, getUsageExercise, gradeUsageAnswer } from '../../lib/deepseek';
import { speak } from '../../lib/tts';
import { useSettingsStore } from '../../stores/settingsStore';
import { isEquivalentUsageAnswer } from '../../utils/usageAnswer';
import './StudyCards.css';

function getDisplayMeaning(word) {
    if (word.all_meanings?.length > 0) return word.all_meanings[0];
    return word.meaning_cn || '';
}

export default function UsageCard({ word, usageSceneMode, onSubmit, onSkip }) {
    const { settings } = useSettingsStore();
    const [exercise, setExercise] = useState(null);
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(true);
    const [grading, setGrading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [questionOpen, setQuestionOpen] = useState(false);
    const [questionText, setQuestionText] = useState('');
    const [questionAnswer, setQuestionAnswer] = useState('');
    const [questionError, setQuestionError] = useState('');
    const [asking, setAsking] = useState(false);
    const inputRef = useRef(null);
    const advanceLockRef = useRef(false);
    const meaning = useMemo(() => getDisplayMeaning(word), [word]);
    const scorePercent = result ? Math.round(result.score * 100) : 0;
    const recommendedAnswer = result?.corrected_answer_en || exercise?.reference_answer_en || '';
    const referenceAnswer = exercise?.reference_answer_en || '';
    const showReferenceAnswer = Boolean(
        result &&
        recommendedAnswer &&
        referenceAnswer &&
        !isEquivalentUsageAnswer(recommendedAnswer, [referenceAnswer])
    );
    const canRedo = Boolean(result && scorePercent < 100);

    const loadExercise = useCallback(async () => {
        advanceLockRef.current = false;
        setLoading(true);
        setError('');
        setResult(null);
        setAnswer('');
        setExercise(null);
        setQuestionOpen(false);
        setQuestionText('');
        setQuestionAnswer('');
        setQuestionError('');
        setAsking(false);

        try {
            const data = await getUsageExercise(word.word, meaning, usageSceneMode);
            setExercise(data);
            setTimeout(() => inputRef.current?.focus(), 0);
        } catch (err) {
            setError(err.message || '场景题加载失败');
        } finally {
            setLoading(false);
        }
    }, [meaning, usageSceneMode, word.word]);

    useEffect(() => {
        loadExercise();
    }, [loadExercise]);

    const handleSpeak = () => {
        speak(word.word, { rate: settings.tts_rate, enabled: settings.tts_enabled });
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!answer.trim() || !exercise || grading || result) return;

        setGrading(true);
        setError('');
        try {
            const grade = await gradeUsageAnswer({
                word: word.word,
                meaningCn: meaning,
                promptCn: exercise.prompt_cn,
                referenceAnswerEn: exercise.reference_answer_en,
                answerEn: answer.trim(),
            });
            setResult(grade);
        } catch (err) {
            setError(err.message || '批改失败，请重试');
        } finally {
            setGrading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSubmit(e);
        }
    };

    const handleRedo = () => {
        if (grading || asking) return;

        setAnswer('');
        setResult(null);
        setError('');
        setQuestionOpen(false);
        setQuestionText('');
        setQuestionAnswer('');
        setQuestionError('');
        setAsking(false);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const proceedOnce = (passed) => {
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;
        onSubmit(passed, exercise?.variant_index);
    };

    const skipOnce = () => {
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;
        onSkip(exercise?.variant_index);
    };

    const handleAskQuestion = async (e) => {
        e?.preventDefault();
        if (!questionText.trim() || !exercise || !result || asking) return;

        setAsking(true);
        setQuestionError('');
        try {
            const explanation = await askUsageQuestion({
                word: word.word,
                meaningCn: meaning,
                promptCn: exercise.prompt_cn,
                referenceAnswerEn: exercise.reference_answer_en,
                answerEn: answer.trim(),
                feedbackCn: result.feedback_cn,
                correctedAnswerEn: result.corrected_answer_en || exercise.reference_answer_en,
                questionCn: questionText.trim(),
            });
            setQuestionAnswer(explanation.answer_cn);
        } catch (err) {
            setQuestionError(err.message || '追问失败，请重试');
        } finally {
            setAsking(false);
        }
    };

    return (
        <div className="study-card usage-card">
            <div className="card-phase-label">场景应用</div>

            <div className="usage-target">
                <span className="usage-target-label">目标词（可变形）</span>
                <div className="usage-target-word">
                    <span>{word.word}</span>
                    <button className="btn-speak" onClick={handleSpeak} title="发音">
                        🔊
                    </button>
                </div>
                {meaning && <div className="usage-meaning">{meaning}</div>}
            </div>

            {loading ? (
                <div className="usage-loading">
                    <div className="loading-spinner"></div>
                    <p>正在准备场景题...</p>
                </div>
            ) : error && !exercise ? (
                <div className="usage-error">
                    <p>{error}</p>
                    <div className="usage-actions">
                        <button className="btn-secondary" onClick={loadExercise}>
                            重试
                        </button>
                        <button className="btn-secondary muted" onClick={skipOnce}>
                            暂时跳过
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="usage-prompt">
                        <span className="usage-prompt-label">请翻译</span>
                        <p>{exercise.prompt_cn}</p>
                    </div>

                    <form className="usage-form" onSubmit={handleSubmit}>
                        <textarea
                            ref={inputRef}
                            className={`usage-input ${result?.passed ? 'input-correct' : result && !result.passed ? 'input-incorrect' : ''}`}
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="输入完整英文句子..."
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck="false"
                            disabled={grading || Boolean(result)}
                        />

                        {!result && (
                            <button
                                type="submit"
                                className="btn-submit-usage"
                                disabled={grading || !answer.trim()}
                            >
                                {grading ? '批改中...' : '提交批改'}
                            </button>
                        )}
                    </form>

                    {error && (
                        <div className="usage-error inline">
                            <p>{error}</p>
                            <div className="usage-actions">
                                <button className="btn-secondary" onClick={handleSubmit} disabled={grading}>
                                    重试批改
                                </button>
                                <button className="btn-secondary muted" onClick={skipOnce}>
                                    暂时跳过
                                </button>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className={`usage-feedback ${result.passed ? 'correct' : 'incorrect'}`}>
                            <div className="usage-feedback-title">
                                <span>{result.passed ? '✅ 用对了' : '❌ 需要再练'}</span>
                                <span>{scorePercent}分</span>
                            </div>
                            {result.feedback_cn && <p>{result.feedback_cn}</p>}
                            <div className="usage-reference">
                                <span>推荐表达</span>
                                <strong>{recommendedAnswer}</strong>
                                {showReferenceAnswer && (
                                    <div className="usage-reference-secondary">
                                        <span>参考答案</span>
                                        <strong>{referenceAnswer}</strong>
                                    </div>
                                )}
                            </div>
                            <div className="usage-question">
                                {!questionOpen ? (
                                    <button
                                        type="button"
                                        className="btn-secondary usage-question-toggle"
                                        onClick={() => setQuestionOpen(true)}
                                    >
                                        我有疑问
                                    </button>
                                ) : (
                                    <form className="usage-question-form" onSubmit={handleAskQuestion}>
                                        <textarea
                                            className="usage-question-input"
                                            value={questionText}
                                            onChange={e => setQuestionText(e.target.value)}
                                            placeholder="输入你的问题..."
                                            disabled={asking}
                                            rows="3"
                                        />
                                        <button
                                            type="submit"
                                            className="btn-secondary"
                                            disabled={asking || !questionText.trim()}
                                        >
                                            {asking ? '解答中...' : '提问'}
                                        </button>
                                    </form>
                                )}
                                {questionError && <p className="usage-question-error">{questionError}</p>}
                                {questionAnswer && <div className="usage-question-answer">{questionAnswer}</div>}
                            </div>
                            <div className={canRedo ? 'usage-result-actions two' : 'usage-result-actions'}>
                                {canRedo && (
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={handleRedo}
                                        disabled={advanceLockRef.current}
                                    >
                                        重做本场景
                                    </button>
                                )}
                                <button
                                    className="btn-submit-usage"
                                    onClick={() => proceedOnce(result.passed)}
                                    disabled={advanceLockRef.current}
                                >
                                    {result.passed ? '下一题' : '继续（加入回流）'}
                                </button>
                            </div>
                        </div>
                    )}

                    <p className="hint-keyboard">按 Ctrl + Enter 提交</p>
                </>
            )}
        </div>
    );
}
