import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Timer,
  ListTodo,
  CalendarDays,
  BarChart3,
  Sparkles,
  Settings,
  Zap,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/timer', icon: Timer, label: 'Focus Timer' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap size={20} color="white" />
        </div>
        <span className="sidebar-logo-text">FocusFlow</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">Main</div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
            end={item.to === '/'}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}

        <div className="nav-section">AI</div>
        <NavLink
          to="/ai-decompose"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <Sparkles size={18} />
          AI Decompose
        </NavLink>

        <div style={{ flex: 1 }} />

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'active' : ''}`
          }
        >
          <Settings size={18} />
          Settings
        </NavLink>
      </nav>
    </aside>
  );
}
