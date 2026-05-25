import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStudyStore } from '../stores/studyStore';
import { generateDailyQueue } from '../utils/taskEngine';
import { PHASE, STEP } from '../utils/constants';
import RecallCard from '../components/Study/RecallCard';
import SpellingCard from '../components/Study/SpellingCard';
import UsageCard from '../components/Study/UsageCard';
import { speak } from '../lib/tts';
import './StudyPage.css';

export default function StudyPage() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { settings } = useSettingsStore();
    const study = useStudyStore();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) {
            initSession();
        }
        return () => {
            // Don't reset on unmount if complete (want to show report)
        };
    }, [user]);

    const initSession = async () => {
        try {
            setLoading(true);
            setError('');

            if (study.isActive && study.currentWord) {
                if (!study.sessionUserId || study.sessionUserId === user.id) {
                    study.setSessionSettings(study.sessionSettings || settings);
                    setLoading(false);
                    return;
                }

                study.resetSession();
            }

            study.setSessionSettings(settings);
            const { reviewWords, newWords } = await generateDailyQueue(settings, user.id);

            if (reviewWords.length === 0 && newWords.length === 0) {
                setError('今日没有需要学习的单词！');
                setLoading(false);
                return;
            }

            study.startSession(reviewWords, newWords, user.id);
            console.log('start_session', { type: 'all' });
        } catch (err) {
            console.error('Failed to init session:', err);
            setError('加载失败：' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Auto-speak on new recall card
    useEffect(() => {
        if (study.currentWord && study.step === STEP.RECALL && settings.tts_enabled) {
            speak(study.currentWord.word, { rate: settings.tts_rate, enabled: true });
        }
    }, [study.currentWord?.word, study.step]);

    const handleExit = () => {
        study.resetSession();
        navigate('/');
    };

    const getPhaseLabel = () => {
        switch (study.phase) {
            case PHASE.REVIEW: return '复习';
            case PHASE.NEW_LEARN: return '新学';
            case PHASE.NEW_REVIEW: return '新词复习';
            case PHASE.RELAPSE: return '错词回流';
            default: return '';
        }
    };

    // Calculate progress
    const totalItems = study.getTotalItems();
    const completedItems = study.getCompletedItems();
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    if (loading) {
        return (
            <div className="study-page">
                <div className="study-loading">
                    <div className="loading-spinner large"></div>
                    <p>准备学习任务...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="study-page">
                <div className="study-error">
                    <p>{error}</p>
                    <button className="btn-primary" onClick={() => navigate('/')}>返回首页</button>
                </div>
            </div>
        );
    }

    // Complete screen
    if (study.phase === PHASE.COMPLETE) {
        const results = study.sessionResults;
        const duration = Math.round((Date.now() - results.startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const accuracy = results.spellingTotal > 0
            ? Math.round((results.spellingCorrect / results.spellingTotal) * 100)
            : 100;

        let hardestWord = '';
        let maxErrors = 0;
        for (const [word, count] of Object.entries(results.wordErrors)) {
            if (count > maxErrors) { maxErrors = count; hardestWord = word; }
        }

        return (
            <div className="study-page">
                <div className="study-complete">
                    <div className="complete-celebration">🎉</div>
                    <h2>学习完成！</h2>

                    <div className="complete-stats">
                        <div className="complete-stat">
                            <span className="complete-stat-value">{results.newCount}</span>
                            <span className="complete-stat-label">新学</span>
                        </div>
                        <div className="complete-stat">
                            <span className="complete-stat-value">{results.reviewCount}</span>
                            <span className="complete-stat-label">复习</span>
                        </div>
                        <div className="complete-stat">
                            <span className="complete-stat-value">{accuracy}%</span>
                            <span className="complete-stat-label">拼写正确率</span>
                        </div>
                        <div className="complete-stat">
                            <span className="complete-stat-value">{results.levelUps}</span>
                            <span className="complete-stat-label">升级词数</span>
                        </div>
                    </div>

                    <div className="complete-details">
                        <div className="detail-row">
                            <span>⏱️ 学习时长</span>
                            <strong>{minutes}分{seconds}秒</strong>
                        </div>
                        <div className="detail-row">
                            <span>✅ 回想通过</span>
                            <strong>{results.recallKnow} / {results.recallKnow + results.recallDontKnow}</strong>
                        </div>
                        {results.usageTotal > 0 && (
                            <div className="detail-row">
                                <span>场景应用通过</span>
                                <strong>{results.usagePassed} / {results.usageTotal}</strong>
                            </div>
                        )}
                        {results.usageSkipped > 0 && (
                            <div className="detail-row">
                                <span>场景题跳过</span>
                                <strong>{results.usageSkipped}</strong>
                            </div>
                        )}
                        {hardestWord && (
                            <div className="detail-row">
                                <span>💪 最难词</span>
                                <strong>{hardestWord}</strong>
                            </div>
                        )}
                    </div>

                    <button className="btn-primary btn-finish" onClick={handleExit}>
                        返回首页
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="study-page">
            {/* Top bar */}
            <div className="study-topbar">
                <button className="btn-exit" onClick={handleExit}>✕</button>
                <div className="study-progress-info">
                    <span className="phase-label">{getPhaseLabel()}</span>
                    <span className="progress-count">{completedItems}/{totalItems}</span>
                </div>
                <div style={{ width: 40 }}></div>
            </div>

            {/* Progress bar */}
            <div className="study-progress-bar">
                <div
                    className="study-progress-fill"
                    style={{ width: `${progressPercent}%` }}
                ></div>
            </div>

            {/* Card area */}
            <div className="study-card-area">
                {study.currentWord && study.step === STEP.RECALL && (
                    <RecallCard
                        key={`recall-${study.currentWord.word}-${study.phase}-${completedItems}`}
                        word={study.currentWord}
                        showAnswer={study.showAnswer}
                        onReveal={() => study.revealAnswer()}
                        onSubmit={(know) => study.submitRecall(know)}
                    />
                )}

                {study.currentWord && study.step === STEP.SPELLING && (
                    <SpellingCard
                        key={`spell-${study.currentWord.word}-${study.phase}-${completedItems}`}
                        word={study.currentWord}
                        spellingResult={study.spellingResult}
                        correctSpelling={study.correctSpelling}
                        needsCorrection={study.needsCorrection}
                        correctionDone={study.correctionDone}
                        onSubmit={(input) => study.submitSpelling(input)}
                        onProceed={() => study.proceedAfterSpelling()}
                    />
                )}

                {study.currentWord && study.step === STEP.USAGE && (
                    <UsageCard
                        key={`usage-${study.currentWord.word}-${study.phase}-${completedItems}`}
                        word={study.currentWord}
                        onSubmit={(passed) => study.submitUsage(passed)}
                        onSkip={() => study.skipUsage()}
                    />
                )}
            </div>
        </div>
    );
}
