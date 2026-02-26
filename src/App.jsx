import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import TabBar from './components/Layout/TabBar';
import LoginPage from './pages/LoginPage';
import TodayPage from './pages/TodayPage';
import StudyPage from './pages/StudyPage';
import WordlistPage from './pages/WordlistPage';
import ProgressPage from './pages/ProgressPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute><TodayPage /></ProtectedRoute>
          } />
          <Route path="/study" element={
            <ProtectedRoute><StudyPage /></ProtectedRoute>
          } />
          <Route path="/wordlist" element={
            <ProtectedRoute><WordlistPage /></ProtectedRoute>
          } />
          <Route path="/progress" element={
            <ProtectedRoute><ProgressPage /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute><SettingsPage /></ProtectedRoute>
          } />
        </Routes>
        <TabBar />
      </div>
    </HashRouter>
  );
}
