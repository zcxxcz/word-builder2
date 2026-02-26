import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
    const { user, signIn, signUp } = useAuthStore();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    if (user) return <Navigate to="/" replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            if (isLogin) {
                await signIn(email, password);
            } else {
                await signUp(email, password);
                setMessage('注册成功！请检查邮箱确认后登录。');
            }
        } catch (err) {
            setError(err.message || '操作失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <div className="login-logo">📖</div>
                    <h1>单词大师</h1>
                    <p className="login-subtitle">初一英语词汇学习</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">邮箱</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">密码</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="至少6位"
                            required
                            minLength={6}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                        />
                    </div>

                    {error && <div className="form-error">{error}</div>}
                    {message && <div className="form-success">{message}</div>}

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? '处理中...' : isLogin ? '登录' : '注册'}
                    </button>
                </form>

                <div className="login-toggle">
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); setMessage(''); }}
                        className="btn-link"
                    >
                        {isLogin ? '没有账号？点击注册' : '已有账号？点击登录'}
                    </button>
                </div>
            </div>
        </div>
    );
}
