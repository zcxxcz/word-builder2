import { useAuthStore } from '../../stores/authStore';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuthStore();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>加载中...</p>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
}
