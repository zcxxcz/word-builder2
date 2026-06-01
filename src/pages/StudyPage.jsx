import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStudyStore } from '../stores/studyStore';
import { THEMES, useThemeStore } from '../stores/themeStore';
import { generateNewLearningQueue, generateReviewQueue } from '../utils/taskEngine';
import { PHASE, STEP } from '../utils/constants';
import RecallCard from '../components/Study/RecallCard';
import SpellingCard from '../components/Study/SpellingCard';
import UsageCard from '../components/Study/UsageCard';
import { speak } from '../lib/tts';
import './StudyPage.css';

export default function StudyPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuthStore();
    const { settings, loadSettings, loaded } = useSettingsStore();
    const { theme } = useThemeStore();
    const study = useStudyStore();
    const isFlorrTheme = theme === THEMES.FLORR;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const routeKey = searchParams.toString();

    useEffect(() => {
        if (user && !loaded) {
            loadSettings(user.id);
        }
    }, [user, loaded]);

    useEffect(() => {
        if (user && loaded) {
            initSession();
        }
        return () => {
            // Don't reset on unmount if complete (want to show report)
        };
    }, [user, loaded, routeKey]);

    const initSession = async () => {
        try {
            setLoading(true);
            setError('');

            if (study.isActive && study.currentWord) {
                if (!study.sessionUserId || study.sessionUserId === user.id) {
                    study.setSessionSettings(study.sessionSettings || settings);
                    void study.saveActiveSession();
                    setLoading(false);
                    return;
                }

                study.resetSession();
            }

            const restored = await study.loadActiveSession(user.id);
            if (restored) {
                const restoredStudy = useStudyStore.getState();
                restoredStudy.setSessionSettings(restoredStudy.sessionSettings || settings);
                setLoading(false);
                return;
            }

            const mode = searchParams.get('mode');
            study.setSessionSettings(settings);

            if (mode === 'review') {
                const { reviewWords } = await generateReviewQueue(settings, user.id);

                if (reviewWords.length === 0) {
                    setError('当前没有到期复习的单词！');
                    setLoading(false);
                    return;
                }

                study.startSession(reviewWords, [], user.id, 'review');
                console.log('start_session', { type: 'review' });
            } else if (mode === 'new') {
                const selection = getNewLearningSelection();
                const { newWords } = await generateNewLearningQueue(settings, user.id, selection);

                if (newWords.length === 0) {
                    setError('这个选择里没有可新学的单词！');
                    setLoading(false);
                    return;
                }

                study.startSession([], newWords, user.id, 'new');
                console.log('start_session', { type: 'new' });
            } else {
                setError('请选择复习，或先到词表里选择要新学的单词。');
                setLoading(false);
                return;
            }
        } catch (err) {
            console.error('Failed to init session:', err);
            setError('加载失败：' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getNewLearningSelection = () => {
        const source = searchParams.get('source');
        const listId = searchParams.get('listId');
        const unit = searchParams.get('unit');
        const ids = (searchParams.get('ids') || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);

        if (!['builtin', 'custom'].includes(source)) {
            throw new Error('请选择有效的词表来源');
        }

        if (ids.length > 0) {
            return { source, ids };
        }

        if (!listId) {
            throw new Error('请选择要新学的词表');
        }

        return unit ? { source, listId, unit } : { source, listId };
    };

    // Auto-speak on new recall card
    useEffect(() => {
        if (study.currentWord && study.step === STEP.RECALL && settings.tts_enabled) {
            speak(study.currentWord.word, { rate: settings.tts_rate, enabled: true });
        }
    }, [study.currentWord?.word, study.step]);

    const handleExit = () => {
        const exitTarget = study.sessionType === 'new' ? '/wordlist' : '/';
        study.resetSession();
        navigate(exitTarget);
    };

    const getPhaseLabel = () => {
        switch (study.phase) {
            case PHASE.REVIEW: return isFlorrTheme ? '挑战' : '复习';
            case PHASE.NEW_LEARN: return isFlorrTheme ? '收集' : '新学';
            case PHASE.NEW_REVIEW: return isFlorrTheme ? '强化' : '新词复习';
            case PHASE.RELAPSE: return isFlorrTheme ? '回炉' : '错词回流';
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
                    <button className="btn-primary" onClick={() => navigate('/')}>返回今日</button>
                    <button className="btn-secondary" onClick={() => navigate('/wordlist')}>去词表</button>
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
        const errorWordCount = Object.keys(results.wordErrors).length;

        return (
            <div className="study-page">
                <div className="study-complete">
                    <div className="complete-celebration">
                        {isFlorrTheme ? (
                            <img
                                className="complete-florr-logo"
                                src={`${import.meta.env.BASE_URL}florr-logo.png`}
                                alt="florr.io"
                            />
                        ) : '🎉'}
                    </div>
                    <h2>{isFlorrTheme ? '探索完成！' : '学习完成！'}</h2>

                    <div className="complete-stats">
                        <div className="complete-stat">
                            <span className="complete-stat-value">{results.newCount}</span>
                            <span className="complete-stat-label">{isFlorrTheme ? '新花瓣' : '新学'}</span>
                        </div>
                        <div className="complete-stat">
                            <span className="complete-stat-value">{results.reviewCount}</span>
                            <span className="complete-stat-label">{isFlorrTheme ? '挑战' : '复习'}</span>
                        </div>
                        <div className="complete-stat">
                            <span className="complete-stat-value">{accuracy}%</span>
                            <span className="complete-stat-label">拼写正确率</span>
                        </div>
                        <div className="complete-stat">
                            <span className="complete-stat-value">{results.levelUps}</span>
                            <span className="complete-stat-label">{isFlorrTheme ? '花瓣升级' : '升级词数'}</span>
                        </div>
                    </div>

                    <div className="complete-details">
                        <div className="detail-row">
                            <span>{isFlorrTheme ? '探索时长' : '⏱️ 学习时长'}</span>
                            <strong>{minutes}分{seconds}秒</strong>
                        </div>
                        {isFlorrTheme && results.newCount > 0 && (
                            <div className="detail-row">
                                <span>获得新花瓣</span>
                                <strong>{results.newCount}</strong>
                            </div>
                        )}
                        {isFlorrTheme && results.levelUps > 0 && (
                            <div className="detail-row">
                                <span>花瓣升级</span>
                                <strong>{results.levelUps}</strong>
                            </div>
                        )}
                        {isFlorrTheme && errorWordCount > 0 && (
                            <div className="detail-row">
                                <span>回炉强化</span>
                                <strong>{errorWordCount}</strong>
                            </div>
                        )}
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
                                <span>{isFlorrTheme ? '今日最难挑战' : '💪 最难词'}</span>
                                <strong>{hardestWord}</strong>
                            </div>
                        )}
                    </div>

                    <button className="btn-primary btn-finish" onClick={handleExit}>
                        {isFlorrTheme ? '返回今日探索' : '返回首页'}
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
                        onSubmit={(passed, variantIndex) => study.submitUsage(passed, variantIndex)}
                        onSkip={(variantIndex) => study.skipUsage(variantIndex)}
                    />
                )}
            </div>
        </div>
    );
}
