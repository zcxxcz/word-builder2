import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { THEMES, useThemeStore } from '../stores/themeStore';
import { getTaskCounts } from '../utils/taskEngine';
import { getStudyDateDaysAgo, getToday, STUDY_TIME_ZONE } from '../utils/srs';
import { calculateStreak } from '../utils/streak';
import { buildThirtyMinuteStudyPlan } from '../utils/progressStats';
import { supabase } from '../lib/supabase';
import './TodayPage.css';

export default function TodayPage() {
    const { user } = useAuthStore();
    const { settings, loadSettings, loaded } = useSettingsStore();
    const { theme } = useThemeStore();
    const navigate = useNavigate();
    const isFlorrTheme = theme === THEMES.FLORR;

    const [counts, setCounts] = useState(null);
    const [loading, setLoading] = useState(true);
    const [todaySession, setTodaySession] = useState(null);
    const [todaySessions, setTodaySessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [streakInfo, setStreakInfo] = useState(null);
    const [recentSessions, setRecentSessions] = useState([]);

    useEffect(() => {
        if (user && !loaded) {
            loadSettings(user.id);
        }
    }, [user, loaded]);

    useEffect(() => {
        if (user && loaded) {
            loadCounts();
            loadTodaySession();
            loadActiveSession();
            loadStreak();
            loadRecentSessions();
        }
    }, [user, loaded]);

    const loadCounts = async () => {
        try {
            const c = await getTaskCounts(settings, user.id);
            setCounts(c);
        } catch (err) {
            console.error('Failed to load counts:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadTodaySession = async () => {
        const today = getToday();
        const { data } = await supabase
            .from('sessions')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('created_at', { ascending: false });
        const sessions = data || [];
        setTodaySession(sessions[0] || null);
        setTodaySessions(sessions);
    };

    const loadActiveSession = async () => {
        const { data } = await supabase
            .from('active_study_sessions')
            .select('updated_at, session_type')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();
        setActiveSession(data);
    };

    const loadStreak = async () => {
        const { data } = await supabase
            .from('sessions')
            .select('date')
            .eq('user_id', user.id)
            .gte('date', getStudyDateDaysAgo(400));
        setStreakInfo(calculateStreak((data || []).map(s => s.date)));
    };

    const loadRecentSessions = async () => {
        const { data } = await supabase
            .from('sessions')
            .select('new_count, review_count, duration_seconds')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5);
        setRecentSessions(data || []);
    };

    const startReview = () => {
        const cap = budgetPlan?.recommendedReviewCount || counts?.reviewBatchCount || 0;
        navigate(cap > 0 ? `/study?mode=review&cap=${cap}` : '/study?mode=review');
    };

    const chooseNewWords = () => {
        navigate('/wordlist');
    };

    const continueStudy = () => {
        navigate('/study');
    };

    const budgetPlan = counts
        ? buildThirtyMinuteStudyPlan(recentSessions, counts, settings)
        : null;
    const estimatedMinutes = budgetPlan?.totalMinutes || 0;

    // Daily goal: finish the recommended 30-minute review batch. New learning is a bonus.
    const reviewDoneToday = todaySessions.reduce((sum, s) => sum + (s.review_count || 0), 0);
    const newDoneToday = todaySessions.reduce((sum, s) => sum + (s.new_count || 0), 0);
    const remainingDue = counts?.reviewCount || 0;
    const recommendedReviewCount = budgetPlan?.recommendedReviewCount || 0;
    const goalTotal = Math.max(reviewDoneToday, recommendedReviewCount);
    const goalAchieved = goalTotal > 0 && (
        remainingDue === 0 ||
        (reviewDoneToday > 0 && reviewDoneToday >= recommendedReviewCount)
    );
    const goalPercent = goalAchieved
        ? 100
        : goalTotal > 0
            ? Math.min(100, Math.round((reviewDoneToday / goalTotal) * 100))
            : 100;

    const RING_RADIUS = 30;
    const RING_CIRC = 2 * Math.PI * RING_RADIUS;

    return (
        <div className="today-page">
            <header className="today-header">
                {isFlorrTheme && (
                    <img
                        className="florr-logo"
                        src={`${import.meta.env.BASE_URL}florr-logo.png`}
                        alt="florr.io"
                    />
                )}
                <h1>{isFlorrTheme ? '今日探索' : '今日学习'}</h1>
                <p className="today-date">
                    {new Date().toLocaleDateString('zh-CN', {
                        timeZone: STUDY_TIME_ZONE,
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                    })}
                </p>
            </header>

            {loading ? (
                <div className="today-loading">
                    <div className="loading-spinner"></div>
                </div>
            ) : (
                <>
                    {streakInfo && (
                        <div className={`streak-banner ${streakInfo.studiedToday ? 'active' : ''}`}>
                            <span className="streak-icon">🔥</span>
                            <div className="streak-text">
                                {streakInfo.streak > 0 ? (
                                    <>
                                        <strong>
                                            {isFlorrTheme ? '连续探索' : '连续学习'} {streakInfo.streak} 天
                                        </strong>
                                        <span>
                                            {streakInfo.studiedToday
                                                ? '今日已打卡'
                                                : '今天还没打卡，学一组保持连续'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <strong>{isFlorrTheme ? '开启连续探索' : '开启连续打卡'}</strong>
                                        <span>今天完成一次学习，点燃火焰</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div className={`goal-card ${goalAchieved ? 'achieved' : ''}`}>
                        <div className={`goal-ring ${goalAchieved ? 'achieved' : ''}`}>
                            <svg viewBox="0 0 80 80" width="80" height="80">
                                <circle className="goal-ring-track" cx="40" cy="40" r={RING_RADIUS} />
                                <circle
                                    className="goal-ring-fill"
                                    cx="40"
                                    cy="40"
                                    r={RING_RADIUS}
                                    strokeDasharray={RING_CIRC}
                                    strokeDashoffset={RING_CIRC * (1 - goalPercent / 100)}
                                />
                            </svg>
                            <div className="goal-ring-center">
                                {goalAchieved ? '🎉' : goalTotal === 0 ? '✓' : `${goalPercent}%`}
                            </div>
                        </div>
                        <div className="goal-text">
                            {goalTotal === 0 ? (
                                <>
                                    <strong>今日无到期复习</strong>
                                    <span>{isFlorrTheme ? '可以去收集新花瓣加餐' : '可以去词表新学一组加餐'}</span>
                                </>
                            ) : goalAchieved ? (
                                <>
                                    <strong>今日 30 分钟计划完成！</strong>
                                    <span>
                                        {remainingDue > 0
                                            ? `还剩 ${remainingDue} 词，明天继续`
                                            : '到期复习已完成'}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <strong>今日目标：完成 30 分钟计划</strong>
                                    <span>
                                        建议先复习 {recommendedReviewCount} 词
                                        {budgetPlan?.hasDeferredReviews
                                            ? `，剩余 ${budgetPlan.deferredReviewCount} 词明天继续`
                                            : `，共待复习 ${remainingDue} 词`}
                                    </span>
                                </>
                            )}
                            {newDoneToday > 0 && (
                                <span className="goal-bonus">✨ 加餐新学 {newDoneToday} 词</span>
                            )}
                        </div>
                    </div>

                    <div className="today-stats">
                        <div className="stat-card stat-review">
                            <div className="stat-number">{counts?.reviewCount || 0}</div>
                            <div className="stat-label">{isFlorrTheme ? '待挑战' : '今日待复习'}</div>
                            <div className="stat-icon">🔄</div>
                        </div>
                        <div className="stat-card stat-new">
                            <div className="stat-number">{counts?.newCount || 0}</div>
                            <div className="stat-label">{isFlorrTheme ? '可收集' : '可新学'}</div>
                            <div className="stat-icon">✨</div>
                        </div>
                        <div className="stat-card stat-time">
                            <div className="stat-number">{estimatedMinutes}</div>
                            <div className="stat-label">{isFlorrTheme ? '探索时间' : '计划分钟'}</div>
                            <div className="stat-icon">⏱️</div>
                        </div>
                    </div>

                    {(activeSession || counts?.reviewCount > 0 || counts?.newCount > 0) ? (
                        <div className="today-actions">
                            {activeSession && (
                                <button className="btn-start btn-start-new" onClick={continueStudy}>
                                    <span className="btn-start-icon">▶</span>
                                    <span>{isFlorrTheme ? '继续探索' : '继续未完成学习'}</span>
                                    <span className="btn-start-count">恢复上次进度</span>
                                </button>
                            )}
                            {counts?.reviewCount > 0 && (
                                <button className="btn-start btn-start-review" onClick={startReview}>
                                    <span className="btn-start-icon">🔄</span>
                                    <span>{isFlorrTheme ? '开始挑战' : '开始复习'}</span>
                                    <span className="btn-start-count">
                                        本次建议 {recommendedReviewCount} / 共 {counts?.reviewCount || 0} 词
                                    </span>
                                </button>
                            )}
                            {counts?.newCount > 0 && (
                                <button className="btn-start btn-start-new" onClick={chooseNewWords}>
                                    <span className="btn-start-icon">✨</span>
                                    <span>{isFlorrTheme ? '收集新花瓣' : '去词表选择新词'}</span>
                                    <span className="btn-start-count">
                                        {budgetPlan?.shouldSuggestNewWords
                                            ? `今日可新学 ${budgetPlan.recommendedNewCount} 词`
                                            : counts?.reviewCount > 0
                                                ? '建议先不新学'
                                                : `可新学 ${counts?.newCount || 0} 词`}
                                    </span>
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="today-complete">
                            <div className="complete-icon">🎉</div>
                            <h2>今日任务已完成！</h2>
                            <p>明天继续加油ᐟᐟ</p>
                        </div>
                    )}

                    {todaySession && (
                        <div className="today-report-card">
                            <h3>📋 今日战报</h3>
                            <div className="report-grid">
                                <div className="report-item">
                                    <span className="report-value">{todaySession.new_count}</span>
                                    <span className="report-label">新学</span>
                                </div>
                                <div className="report-item">
                                    <span className="report-value">{todaySession.review_count}</span>
                                    <span className="report-label">复习</span>
                                </div>
                                <div className="report-item">
                                    <span className="report-value">
                                        {Math.round((todaySession.spelling_accuracy || 0) * 100)}%
                                    </span>
                                    <span className="report-label">拼写正确率</span>
                                </div>
                                <div className="report-item">
                                    <span className="report-value">{todaySession.level_ups || 0}</span>
                                    <span className="report-label">升级词数</span>
                                </div>
                            </div>
                            {todaySession.hardest_word && (
                                <div className="report-hardest">
                                    最难词：<strong>{todaySession.hardest_word}</strong>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="today-overview">
                        <div className="overview-item">
                            <span>已学习</span>
                            <strong>{counts?.totalStudied || 0} / {counts?.totalWords || 0} 词</strong>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
