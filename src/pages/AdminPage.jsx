import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatStudyDateForDisplay, getStudyDateDaysAgo, getToday } from '../utils/srs';
import './AdminPage.css';

const EVENT_LABELS = {
    study_session_started: '开始学习',
    study_session_completed: '完成学习',
    recall_failed: '回想失败',
    spelling_failed: '拼写失败',
    usage_failed: '应用失败',
    usage_skipped: '跳过应用',
    ai_call: 'AI 调用',
};

const FAILURE_LABELS = {
    recall_failed: '回想',
    spelling_failed: '拼写',
    usage_failed: '应用',
    session_hardest: '战报最难词',
};

function formatPercent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatMinutes(minutes) {
    const total = Number(minutes || 0);
    if (total < 60) return `${total} 分钟`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function formatDateTime(value) {
    if (!value) return '从未';
    return new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatSessionType(type) {
    if (type === 'review') return '复习';
    if (type === 'new') return '新学';
    return '综合';
}

function formatEventName(name) {
    return EVENT_LABELS[name] || name;
}

function formatFailureType(type) {
    return FAILURE_LABELS[type] || type;
}

function formatMetadata(metadata = {}) {
    const entries = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (entries.length === 0) return '无附加信息';
    return entries.map(([key, value]) => `${key}: ${value}`).join(' · ');
}

export default function AdminPage() {
    const [isAdmin, setIsAdmin] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardError, setDashboardError] = useState('');
    const [startDate, setStartDate] = useState(() => getStudyDateDaysAgo(30));
    const [endDate, setEndDate] = useState(() => getToday());
    const [selectedUserId, setSelectedUserId] = useState('');
    const [userDetail, setUserDetail] = useState(null);
    const [userDetailLoading, setUserDetailLoading] = useState(false);
    const [userDetailError, setUserDetailError] = useState('');

    const overview = dashboard?.overview || {};
    const dailyMetrics = dashboard?.dailyMetrics || [];
    const users = dashboard?.users || [];
    const hardWords = dashboard?.hardWords || [];
    const incompleteSessions = dashboard?.incompleteSessions || { count: 0, sessions: [] };

    const maxDailySessions = Math.max(...dailyMetrics.map(day => Number(day.sessions || 0)), 1);

    const loadDashboard = useCallback(async () => {
        setDashboardLoading(true);
        setDashboardError('');

        const { data, error } = await supabase.rpc('get_admin_dashboard', {
            start_date: startDate,
            end_date: endDate,
        });

        if (error) {
            setDashboardError(error.message || '后台数据加载失败');
            setDashboard(null);
        } else {
            setDashboard(data);
        }

        setDashboardLoading(false);
    }, [startDate, endDate]);

    useEffect(() => {
        let cancelled = false;

        async function checkAdmin() {
            const { data, error } = await supabase.rpc('is_admin');
            if (cancelled) return;
            setIsAdmin(!error && Boolean(data));
        }

        checkAdmin();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isAdmin) return undefined;

        const timer = window.setTimeout(() => {
            loadDashboard();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [isAdmin, loadDashboard]);

    const loadUserDetail = async (userId) => {
        setSelectedUserId(userId);
        setUserDetail(null);
        setUserDetailError('');
        setUserDetailLoading(true);

        const { data, error } = await supabase.rpc('get_admin_user_detail', {
            target_user_id: userId,
        });

        if (error) {
            setUserDetailError(error.message || '用户明细加载失败');
        } else {
            setUserDetail(data);
        }

        setUserDetailLoading(false);
    };

    if (isAdmin === null) {
        return (
            <div className="admin-page">
                <div className="admin-loading">
                    <div className="loading-spinner"></div>
                    <p>正在检查后台权限...</p>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="admin-page">
                <header className="admin-header">
                    <div>
                        <h1>后台管理</h1>
                        <p>当前账号没有后台访问权限。</p>
                    </div>
                    <Link className="admin-back-link" to="/settings">返回我的</Link>
                </header>
                <section className="admin-empty-panel">
                    <h2>无权限</h2>
                    <p>请先在 Supabase SQL Editor 中把管理员邮箱写入 `admin_users`，再重新登录。</p>
                </section>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <header className="admin-header">
                <div>
                    <h1>后台管理</h1>
                    <p>只读查看用户学习情况与轻量使用分析。</p>
                </div>
                <Link className="admin-back-link" to="/settings">返回我的</Link>
            </header>

            <section className="admin-toolbar">
                <label>
                    <span>开始日期</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </label>
                <label>
                    <span>结束日期</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </label>
                <button type="button" onClick={loadDashboard} disabled={dashboardLoading}>
                    {dashboardLoading ? '刷新中...' : '刷新数据'}
                </button>
            </section>

            {dashboardError && <div className="admin-error">{dashboardError}</div>}

            <section className="admin-metrics">
                <div className="admin-metric">
                    <span>总用户</span>
                    <strong>{overview.totalUsers || 0}</strong>
                    <small>活跃 {overview.activeUsers || 0} · 沉默 {overview.inactiveUsers || 0}</small>
                </div>
                <div className="admin-metric">
                    <span>完成学习</span>
                    <strong>{overview.completedSessions || 0}</strong>
                    <small>{formatMinutes(overview.studyMinutes)} 学习时长</small>
                </div>
                <div className="admin-metric">
                    <span>平均正确率</span>
                    <strong>{formatPercent(overview.averageAccuracy)}</strong>
                    <small>升级 {overview.levelUps || 0} 个词</small>
                </div>
                <div className="admin-metric">
                    <span>AI 调用</span>
                    <strong>{overview.aiCalls || 0}</strong>
                    <small>未完成会话 {overview.incompleteSessions || 0}</small>
                </div>
            </section>

            <div className="admin-grid">
                <section className="admin-panel admin-panel-wide">
                    <div className="admin-panel-header">
                        <h2>每日趋势</h2>
                        <span>{formatStudyDateForDisplay(startDate)} - {formatStudyDateForDisplay(endDate)}</span>
                    </div>
                    <div className="admin-daily-list">
                        {dailyMetrics.map(day => (
                            <div className="admin-daily-row" key={day.date}>
                                <div className="admin-daily-date">{formatStudyDateForDisplay(day.date, { month: 'numeric', day: 'numeric' })}</div>
                                <div className="admin-daily-track">
                                    <div
                                        className="admin-daily-fill"
                                        style={{ width: `${(Number(day.sessions || 0) / maxDailySessions) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="admin-daily-meta">
                                    <strong>{day.sessions || 0}</strong>
                                    <span>会话 · DAU {day.activeUsers || 0} · AI {day.aiCalls || 0}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel-header">
                        <h2>错词 Top</h2>
                    </div>
                    {hardWords.length === 0 ? (
                        <p className="admin-muted">暂无错词事件。</p>
                    ) : (
                        <div className="admin-hard-list">
                            {hardWords.map(item => (
                                <div className="admin-hard-item" key={`${item.word}-${item.failureType}`}>
                                    <strong>{item.word}</strong>
                                    <span>{formatFailureType(item.failureType)} · {item.count} 次</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <section className="admin-panel">
                <div className="admin-panel-header">
                    <h2>用户列表</h2>
                    <span>最多显示最近活跃 100 人</span>
                </div>
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>用户</th>
                                <th>最近活跃</th>
                                <th>学习</th>
                                <th>掌握</th>
                                <th>正确率</th>
                                <th>AI</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(item => (
                                <tr
                                    key={item.userId}
                                    className={selectedUserId === item.userId ? 'selected' : ''}
                                    onClick={() => loadUserDetail(item.userId)}
                                >
                                    <td>
                                        <button type="button" className="admin-user-button">
                                            <strong>{item.emailMasked || '无邮箱'}</strong>
                                            <span>{item.userIdShort}{item.hasActiveSession ? ' · 学习中' : ''}</span>
                                        </button>
                                    </td>
                                    <td>{formatDateTime(item.lastActiveAt)}</td>
                                    <td>{item.sessions || 0} 次 · {formatMinutes(item.studyMinutes)}</td>
                                    <td>{item.masteredWords || 0} / {item.studiedWords || 0}</td>
                                    <td>{formatPercent(item.averageAccuracy)}</td>
                                    <td>{item.aiCalls || 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="admin-panel">
                <div className="admin-panel-header">
                    <h2>超时未完成会话</h2>
                    <span>超过 {incompleteSessions.staleAfterMinutes || 30} 分钟未更新</span>
                </div>
                {(incompleteSessions.sessions || []).length === 0 ? (
                    <p className="admin-muted">暂无超时未完成会话。</p>
                ) : (
                    <div className="admin-hard-list">
                        {incompleteSessions.sessions.map(item => (
                            <div className="admin-hard-item" key={`${item.userId}-${item.updatedAt}`}>
                                <strong>{item.emailMasked} · {item.userIdShort}</strong>
                                <span>{formatSessionType(item.sessionType)} · {formatDateTime(item.updatedAt)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {(selectedUserId || userDetailLoading || userDetailError) && (
                <section className="admin-panel admin-detail">
                    <div className="admin-panel-header">
                        <h2>用户明细</h2>
                        <button type="button" onClick={() => {
                            setSelectedUserId('');
                            setUserDetail(null);
                            setUserDetailError('');
                        }}>
                            关闭
                        </button>
                    </div>

                    {userDetailLoading && <p className="admin-muted">正在加载用户明细...</p>}
                    {userDetailError && <div className="admin-error">{userDetailError}</div>}

                    {userDetail && (
                        <>
                            <div className="admin-detail-head">
                                <div>
                                    <strong>{userDetail.profile?.emailMasked || '无邮箱'}</strong>
                                    <span>{userDetail.profile?.userId}</span>
                                </div>
                                <div>
                                    <small>注册 {formatDateTime(userDetail.profile?.createdAt)}</small>
                                    <small>登录 {formatDateTime(userDetail.profile?.lastSignInAt)}</small>
                                </div>
                            </div>

                            <div className="admin-detail-summary">
                                <div><span>学习次数</span><strong>{userDetail.summary?.sessions || 0}</strong></div>
                                <div><span>学习时长</span><strong>{formatMinutes(userDetail.summary?.studyMinutes)}</strong></div>
                                <div><span>已学 / 掌握</span><strong>{userDetail.summary?.studiedWords || 0} / {userDetail.summary?.masteredWords || 0}</strong></div>
                                <div><span>待复习</span><strong>{userDetail.summary?.dueWords || 0}</strong></div>
                            </div>

                            <div className="admin-detail-grid">
                                <div>
                                    <h3>等级分布</h3>
                                    <div className="admin-level-list">
                                        {[0, 1, 2, 3].map(level => (
                                            <div key={level}>
                                                <span>L{level}</span>
                                                <strong>{userDetail.levelDistribution?.[level] || 0}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h3>AI 使用</h3>
                                    {(userDetail.aiUsage || []).length === 0 ? (
                                        <p className="admin-muted">暂无 AI 事件。</p>
                                    ) : (
                                        <div className="admin-hard-list compact">
                                            {userDetail.aiUsage.map(item => (
                                                <div className="admin-hard-item" key={`${item.action}-${item.status}`}>
                                                    <strong>{item.action}</strong>
                                                    <span>{item.status} · {item.count} 次</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="admin-detail-grid">
                                <div>
                                    <h3>最近学习记录</h3>
                                    <div className="admin-event-list">
                                        {(userDetail.recentSessions || []).map(session => (
                                            <div key={session.id} className="admin-event-item">
                                                <strong>{formatStudyDateForDisplay(session.date)} · {formatSessionType(session.type)}</strong>
                                                <span>
                                                    新学 {session.newCount} · 复习 {session.reviewCount} ·
                                                    正确率 {formatPercent(session.spellingAccuracy)} ·
                                                    {Math.floor((session.durationSeconds || 0) / 60)} 分钟
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h3>最近事件</h3>
                                    <div className="admin-event-list">
                                        {(userDetail.recentEvents || []).map((event, index) => (
                                            <div key={`${event.createdAt}-${index}`} className="admin-event-item">
                                                <strong>{formatEventName(event.eventName)} · {formatDateTime(event.createdAt)}</strong>
                                                <span>{formatMetadata(event.metadata)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            )}
        </div>
    );
}
