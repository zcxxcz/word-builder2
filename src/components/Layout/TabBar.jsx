import { NavLink, useLocation } from 'react-router-dom';
import './TabBar.css';

const tabs = [
    { path: '/', label: '今日', icon: '📅' },
    { path: '/wordlist', label: '词表', icon: '📚' },
    { path: '/progress', label: '进度', icon: '📊' },
    { path: '/settings', label: '我的', icon: '⚙️' },
];

export default function TabBar() {
    const location = useLocation();

    // Hide tab bar during focused or non-primary screens.
    if (location.pathname === '/study' || location.pathname === '/admin') return null;

    return (
        <nav className="tab-bar">
            {tabs.map(tab => (
                <NavLink
                    key={tab.path}
                    to={tab.path}
                    className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
                >
                    <span className="tab-icon">{tab.icon}</span>
                    <span className="tab-label">{tab.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
