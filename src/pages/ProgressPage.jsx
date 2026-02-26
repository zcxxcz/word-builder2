import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import './ProgressPage.css';

export default function ProgressPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) loadStats();
    }, [user]);

    const loadStats = async () => {
        try {
            // Level distribution
            const { data: states } = await supabase
                .from('user_word_state')
                .select('level')
                .eq('user_id', user.id);

            const levels = { 0: 0, 1: 0, 2: 0, 3: 0 };
            let total = 0;
            (states || []).forEach(s => {
                levels[s.level] = (levels[s.level] || 0) + 1;
                total++;
            });

            // This week sessions
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const { data: weekSessions } = await supabase
                .from('sessions')
                .select('*')
                .eq('user_id', user.id)
                .gte('date', weekAgo.toISOString().split('T')[0])
                .order('date', { ascending: false });

            const studyDays = new Set((weekSessions || []).map(s => s.date)).size;

            // Recent sessions
            const { data: recentSessions } = await supabase
                .from('sessions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);

            setStats({
                totalStudied: total,
                mastered: levels[3],
                levels,
                studyDaysThisWeek: studyDays,
            });
            setSessions(recentSessions || []);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    const levelLabels = ['L0 陌生', 'L1 认识', 'L2 熟练', 'L3 掌握'];
    const levelColors = ['var(--error)', 'var(--warning)', 'var(--primary)', 'var(--success)'];

    if (loading) {
        return (
            <div className="progress-page">
                <header><h1>学习进度</h1></header>
                <div className="progress-loading"><div className="loading-spinner"></div></div>
            </div>
        );
    }

    const maxLevel = Math.max(...Object.values(stats?.levels || { 0: 1 }), 1);

    return (
        <div className="progress-page">
            <header><h1>学习进度</h1></header>

            {/* Summary Cards */}
            <div className="progress-summary">
                <div className="summary-card">
                    <div className="summary-value">{stats?.totalStudied || 0}</div>
                    <div className="summary-label">已学词数</div>
                </div>
                <div className="summary-card highlight">
                    <div className="summary-value">{stats?.mastered || 0}</div>
                    <div className="summary-label">已掌握 (L3)</div>
                </div>
                <div className="summary-card">
                    <div className="summary-value">{stats?.studyDaysThisWeek || 0}</div>
                    <div className="summary-label">本周学习天数</div>
                </div>
            </div>

            {/* Level Distribution */}
            <div className="progress-section">
                <h2>等级分布</h2>
                <div className="level-chart">
                    {[0, 1, 2, 3].map(level => (
                        <div key={level} className="level-bar-row">
                            <div className="level-label">{levelLabels[level]}</div>
                            <div className="level-bar-track">
                                <div
                                    className="level-bar-fill"
                                    style={{
                                        width: `${((stats?.levels[level] || 0) / maxLevel) * 100}%`,
                                        background: levelColors[level],
                                    }}
                                ></div>
                            </div>
                            <div className="level-count">{stats?.levels[level] || 0}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Sessions */}
            <div className="progress-section">
                <h2>最近学习记录</h2>
                {sessions.length === 0 ? (
                    <div className="empty-state"><p>还没有学习记录</p></div>
                ) : (
                    <div className="session-list">
                        {sessions.map(s => (
                            <div key={s.id} className="session-item">
                                <div className="session-date">
                                    {new Date(s.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                </div>
                                <div className="session-info">
                                    <span>新学 {s.new_count} · 复习 {s.review_count}</span>
                                    <span className="session-accuracy">
                                        {Math.round((s.spelling_accuracy || 0) * 100)}% 正确
                                    </span>
                                </div>
                                <div className="session-duration">
                                    {Math.floor((s.duration_seconds || 0) / 60)}分
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
