import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListTodo, Timer, TrendingUp } from 'lucide-react';

const FEATURES = [
  { icon: ListTodo, text: 'Plan your day with clear, prioritized tasks' },
  { icon: Timer, text: 'Protect deep work with focus sessions' },
  { icon: TrendingUp, text: 'See your streaks and momentum build over time' },
];

export default function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-visual" aria-hidden="true">
        <Link to="/" className="auth-visual-brand">
          <img src="/brand/focusflow-logo.png" alt="" />
          <span>FocusFlow</span>
        </Link>
        <div className="auth-visual-copy">
          <p className="auth-visual-eyebrow">Make attention count</p>
          <h2>A calmer way to finish what matters.</h2>
          <div className="auth-visual-features">
            {FEATURES.map((f) => (
              <div key={f.text}>
                <f.icon size={18} />
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <Link to="/" className="auth-card-brand">
            <img src="/brand/focusflow-logo.png" alt="" />
            <span>FocusFlow</span>
          </Link>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
