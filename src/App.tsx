import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Onboarding from './components/Onboarding';
import Sidebar from './components/Sidebar';
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

export default function App() {
  const theme = useStore((state) => state.theme);
  const accentColor = useStore((state) => state.accentColor);
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);

  useEffect(() => {
    try {
      const rawState = localStorage.getItem('focusflow-storage');
      if (!rawState) return;

      const savedState = JSON.parse(rawState);
      if (savedState?.state && 'openRouterKey' in savedState.state) {
        delete savedState.state.openRouterKey;
        localStorage.setItem('focusflow-storage', JSON.stringify(savedState));
      }
    } catch {
      // Ignore malformed legacy storage and let Zustand replace it on the next update.
    }
  }, []);

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
      <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <Onboarding />
        <Sidebar />
        <main className="main-content">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/timer" element={<Timer />} />
              <Route path="/tasks" element={<TaskList />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/ai-decompose" element={<AIDecompose />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
