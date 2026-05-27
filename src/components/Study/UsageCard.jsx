import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUsageExercise, gradeUsageAnswer } from '../../lib/deepseek';
import { speak } from '../../lib/tts';
import { useSettingsStore } from '../../stores/settingsStore';
import './StudyCards.css';

function getDisplayMeaning(word) {
    if (word.all_meanings?.length > 0) return word.all_meanings[0];
    return word.meaning_cn || '';
}

export default function UsageCard({ word, onSubmit, onSkip }) {
    const { settings } = useSettingsStore();
    const [exercise, setExercise] = useState(null);
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(true);
    const [grading, setGrading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const inputRef = useRef(null);
    const advanceLockRef = useRef(false);
    const meaning = useMemo(() => getDisplayMeaning(word), [word]);

    const loadExercise = useCallback(async () => {
        advanceLockRef.current = false;
        setLoading(true);
        setError('');
        setResult(null);
        setAnswer('');

        try {
            const data = await getUsageExercise(word.word, meaning);
            setExercise(data);
            setTimeout(() => inputRef.current?.focus(), 0);
        } catch (err) {
            setError(err.message || '场景题加载失败');
        } finally {
            setLoading(false);
        }
    }, [meaning, word.word]);

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

    const proceedOnce = (passed) => {
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;
        onSubmit(passed);
    };

    const skipOnce = () => {
        if (advanceLockRef.current) return;
        advanceLockRef.current = true;
        onSkip();
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
                                <span>{Math.round(result.score * 100)}分</span>
                            </div>
                            {result.feedback_cn && <p>{result.feedback_cn}</p>}
                            <div className="usage-reference">
                                <span>参考答案</span>
                                <strong>{result.corrected_answer_en || exercise.reference_answer_en}</strong>
                            </div>
                            <button
                                className="btn-submit-usage"
                                onClick={() => proceedOnce(result.passed)}
                                disabled={advanceLockRef.current}
                            >
                                {result.passed ? '下一题' : '继续（加入回流）'}
                            </button>
                        </div>
                    )}

                    <p className="hint-keyboard">按 Ctrl + Enter 提交</p>
                </>
            )}
        </div>
    );
}
