import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getTaskCounts } from '../utils/taskEngine';
import { supabase } from '../lib/supabase';
import './TodayPage.css';

export default function TodayPage() {
    const { user } = useAuthStore();
    const { settings, loadSettings, loaded } = useSettingsStore();
    const navigate = useNavigate();

    const [counts, setCounts] = useState(null);
    const [loading, setLoading] = useState(true);
    const [todaySession, setTodaySession] = useState(null);

    useEffect(() => {
        if (user && !loaded) {
            loadSettings(user.id);
        }
    }, [user, loaded]);

    useEffect(() => {
        if (user && loaded) {
            loadCounts();
            loadTodaySession();
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
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('sessions')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        setTodaySession(data);
    };

    const startStudy = () => {
        navigate('/study');
    };

    const estimatedMinutes = counts
        ? Math.ceil((counts.reviewCount + counts.newCount) * 0.5)
        : 0;

    return (
        <div className="today-page">
            <header className="today-header">
                <h1>今日学习</h1>
                <p className="today-date">
                    {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
                </p>
            </header>

            {loading ? (
                <div className="today-loading">
                    <div className="loading-spinner"></div>
                </div>
            ) : (
                <>
                    <div className="today-stats">
                        <div className="stat-card stat-review">
                            <div className="stat-number">{counts?.reviewCount || 0}</div>
                            <div className="stat-label">待复习</div>
                            <div className="stat-icon">🔄</div>
                        </div>
                        <div className="stat-card stat-new">
                            <div className="stat-number">{counts?.newCount || 0}</div>
                            <div className="stat-label">新学习</div>
                            <div className="stat-icon">✨</div>
                        </div>
                        <div className="stat-card stat-time">
                            <div className="stat-number">{estimatedMinutes}</div>
                            <div className="stat-label">预计分钟</div>
                            <div className="stat-icon">⏱️</div>
                        </div>
                    </div>

                    {(counts?.reviewCount > 0 || counts?.newCount > 0) ? (
                        <div className="today-actions">
                            <button className="btn-start" onClick={startStudy}>
                                <span className="btn-start-icon">🚀</span>
                                <span>开始学习</span>
                                <span className="btn-start-count">
                                    共 {(counts?.reviewCount || 0) + (counts?.newCount || 0)} 词
                                </span>
                            </button>
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
