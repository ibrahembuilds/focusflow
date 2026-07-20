import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Onboarding from './components/Onboarding';
import Sidebar from './components/Sidebar';
import Landing from './components/Landing';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Seo from './components/Seo';
import { AuthProvider, useAuth } from './lib/auth';
import { useStore } from './store';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Timer = lazy(() => import('./components/Timer'));
const TaskList = lazy(() => import('./components/TaskList'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const Analytics = lazy(() => import('./components/Analytics'));
const AIDecompose = lazy(() => import('./components/AIDecompose'));
const Settings = lazy(() => import('./components/Settings'));

function RouteFallback() {
  return (
    <div className="route-fallback" aria-label="Loading page" role="status">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className="skeleton skeleton-panel" />
    </div>
  );
}

function AppShell() {
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);
  const location = useLocation();

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Seo title="Dashboard" description="Your FocusFlow workspace." path={location.pathname} noindex />
      <Onboarding />
      <Sidebar />
      <main className="main-content">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="timer" element={<Timer />} />
            <Route path="tasks" element={<TaskList />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="ai-decompose" element={<AIDecompose />} />
            <Route path="settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function StoreAuthBridge() {
  const { user } = useAuth();
  const hydrateForUser = useStore((state) => state.hydrateForUser);

  useEffect(() => {
    // Depend on the id only — Supabase emits a fresh `user` object on token
    // refresh too, and re-fetching tasks/sessions on every refresh would be wasted work.
    void hydrateForUser(user ? { id: user.id, user_metadata: user.user_metadata } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hydrateForUser]);

  return null;
}

export default function App() {
  const theme = useStore((state) => state.theme);
  const accentColor = useStore((state) => state.accentColor);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'light' ? '#f4f7f5' : '#101512',
    );
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accentColor;
  }, [accentColor]);

  return (
    <BrowserRouter>
      <AuthProvider>
        <StoreAuthBridge />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/app/*" element={<AppShell />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
