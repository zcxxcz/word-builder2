import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { THEMES, useThemeStore } from '../stores/themeStore';
import { supabase } from '../lib/supabase';
import { formatStudyDateForDisplay, getStudyDateDaysAgo } from '../utils/srs';
import { FLORR_WORDLIST_NAME, getFlorrRarity } from '../utils/florrTheme';
import './ProgressPage.css';

export default function ProgressPage() {
    const { user } = useAuthStore();
    const { theme } = useThemeStore();
    const [stats, setStats] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [florrGallery, setFlorrGallery] = useState([]);
    const [loading, setLoading] = useState(true);
    const isFlorrTheme = theme === THEMES.FLORR;

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
            const weekAgo = getStudyDateDaysAgo(7);
            const { data: weekSessions } = await supabase
                .from('sessions')
                .select('*')
                .eq('user_id', user.id)
                .gte('date', weekAgo)
                .order('date', { ascending: false });

            const studyDays = new Set((weekSessions || []).map(s => s.date)).size;

            // Recent sessions
            const { data: recentSessions } = await supabase
                .from('sessions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);

            const { data: florrLists } = await supabase
                .from('built_in_wordlists')
                .select('id')
                .eq('name', FLORR_WORDLIST_NAME)
                .limit(1);

            if (florrLists?.[0]) {
                const { data: florrWords } = await supabase
                    .from('built_in_words')
                    .select('word, meaning_cn, unit')
                    .eq('wordlist_id', florrLists[0].id)
                    .order('unit')
                    .order('word');

                const wordKeys = [...new Set((florrWords || []).map(w => w.word.toLowerCase()))];
                let florrStates = [];
                if (wordKeys.length > 0) {
                    const { data: stateRows } = await supabase
                        .from('user_word_state')
                        .select('word, level')
                        .eq('user_id', user.id)
                        .in('word', wordKeys);
                    florrStates = stateRows || [];
                }

                const stateMap = new Map(florrStates.map(s => [s.word.toLowerCase(), s.level || 0]));
                setFlorrGallery((florrWords || []).map(word => ({
                    ...word,
                    level: stateMap.get(word.word.toLowerCase()),
                })));
            } else {
                setFlorrGallery([]);
            }

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

    const levelLabels = isFlorrTheme
        ? ['Common', 'Rare', 'Epic', 'Legendary']
        : ['L0 陌生', 'L1 认识', 'L2 熟练', 'L3 掌握'];
    const levelColors = isFlorrTheme
        ? ['#9aa59a', '#4aa3df', '#9b5de5', '#f2b544']
        : ['var(--error)', 'var(--warning)', 'var(--primary)', 'var(--success)'];

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
            <header><h1>{isFlorrTheme ? '花瓣进度' : '学习进度'}</h1></header>

            {/* Summary Cards */}
            <div className="progress-summary">
                <div className="summary-card">
                    <div className="summary-value">{stats?.totalStudied || 0}</div>
                    <div className="summary-label">{isFlorrTheme ? '已收集' : '已学词数'}</div>
                </div>
                <div className="summary-card highlight">
                    <div className="summary-value">{stats?.mastered || 0}</div>
                    <div className="summary-label">{isFlorrTheme ? 'Legendary' : '已掌握 (L3)'}</div>
                </div>
                <div className="summary-card">
                    <div className="summary-value">{stats?.studyDaysThisWeek || 0}</div>
                    <div className="summary-label">本周学习天数</div>
                </div>
            </div>

            {/* Level Distribution */}
            <div className="progress-section">
                <h2>{isFlorrTheme ? '稀有度分布' : '等级分布'}</h2>
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

            {isFlorrTheme && florrGallery.length > 0 && (
                <div className="progress-section">
                    <h2>花瓣图鉴</h2>
                    <div className="petal-gallery">
                        {florrGallery.map(word => {
                            const rarity = word.level === undefined ? null : getFlorrRarity(word.level);

                            return (
                                <div key={`${word.unit}-${word.word}`} className="petal-item">
                                    <span className={`petal-dot ${rarity?.className || 'petal-uncollected'}`}></span>
                                    <div className="petal-info">
                                        <strong>{word.word}</strong>
                                        <span>{word.unit}</span>
                                    </div>
                                    <span className={`rarity-badge ${rarity?.className || 'rarity-common'}`}>
                                        {rarity?.label || '未收集'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
                                    {formatStudyDateForDisplay(s.date)}
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
