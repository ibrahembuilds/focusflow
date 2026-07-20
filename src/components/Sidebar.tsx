import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Timer,
  ListTodo,
  CalendarDays,
  BarChart3,
  Sparkles,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../lib/auth';

const navItems = [
  { to: '/app', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/timer', icon: Timer, label: 'Focus timer' },
  { to: '/app/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/app/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/app/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function Sidebar() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed } = useStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fullName = typeof user?.user_metadata?.fullName === 'string' ? user.user_metadata.fullName : '';
  const displayName = fullName || user?.email || '?';

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <img src="/brand/focusflow-logo.png" alt="" className="sidebar-logo-image" />
        </div>
        <div className="sidebar-logo-copy">
          <span className="sidebar-logo-text">FocusFlow</span>
          <span className="sidebar-logo-caption">Make attention count</span>
        </div>
      </div>

      <nav className="sidebar-nav" id="sidebar-navigation" aria-label="Main navigation">
        <div className="nav-section">Workspace</div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            end={item.to === '/app'}
            aria-label={item.label}
            title={item.label}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="nav-section">Plan</div>
        <NavLink
          to="/app/ai-decompose"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="AI breakdown"
          title="AI breakdown"
        >
          <Sparkles size={18} />
          <span>AI breakdown</span>
        </NavLink>

        <div className="nav-spacer" />

        <button
          type="button"
          className="nav-item nav-collapse"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!sidebarCollapsed}
          aria-controls="sidebar-navigation"
          title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span>{sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
        </button>

        <NavLink
          to="/app/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>

        <button
          type="button"
          className="nav-item theme-toggle"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          <span className="theme-shortcut" aria-hidden="true">
            {theme === 'light' ? 'Dark' : 'Light'}
          </span>
        </button>

        {user && (
          <div className="sidebar-account">
            <div className="sidebar-account-info" title={displayName}>
              <span className="sidebar-account-avatar" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="sidebar-account-email">{displayName}</span>
            </div>
            <button
              type="button"
              className="nav-item sidebar-signout"
              onClick={handleSignOut}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={18} />
              <span>Log out</span>
            </button>
          </div>
        )}
      </nav>
    </aside>
  );
}
