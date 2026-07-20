import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ListTodo,
  Timer,
  Sparkles,
  BarChart3,
  CalendarDays,
  Flame,
  Check,
  Menu,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import Seo from './Seo';

const FAQS = [
  {
    question: 'Is FocusFlow free to use?',
    answer: 'Yes. FocusFlow is free to start and does not require a credit card.',
  },
  {
    question: 'How does the AI task breakdown work?',
    answer:
      'Describe a goal, big or small, and FocusFlow generates an ordered list of 4-8 concrete subtasks you can add to your day with one click.',
  },
  {
    question: 'Is my data private?',
    answer:
      'Yes. Tasks and focus sessions are tied to your account and protected by row-level security, so only you can see your data.',
  },
  {
    question: 'Does FocusFlow work on mobile?',
    answer: 'Yes. FocusFlow is fully responsive and works in any modern mobile or desktop browser.',
  },
];

const FAQ_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
});

const FEATURES = [
  {
    icon: ListTodo,
    title: 'Plan without the clutter',
    description: 'Capture what matters today, set a priority, and let yesterday fall away automatically.',
  },
  {
    icon: Timer,
    title: 'Protect your deep work',
    description: 'A focus timer built for real sessions — presets, custom durations, and built-in breaks.',
  },
  {
    icon: Sparkles,
    title: 'AI breaks down big goals',
    description: 'Paste a goal and get a clear, ordered list of actionable steps in seconds.',
  },
  {
    icon: BarChart3,
    title: 'See your momentum',
    description: 'Weekly charts and completion rates that show progress without the guilt trip.',
  },
  {
    icon: CalendarDays,
    title: 'A calendar that just works',
    description: 'Browse any day to see what you finished and what carried over.',
  },
  {
    icon: Flame,
    title: 'Streaks that motivate',
    description: 'Build a rhythm you can see — one focused day at a time.',
  },
];

const STEPS = [
  { n: '1', title: 'Create your account', description: 'Sign up free — no credit card required.' },
  { n: '2', title: 'Add your first task', description: 'Or let AI break a big goal into clear steps.' },
  { n: '3', title: 'Start a focus session', description: 'Work in protected sprints, then take a real break.' },
];

export default function Landing() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="landing">
      <Seo
        title="FocusFlow"
        description="FocusFlow is a free productivity workspace: plan your day, run Pomodoro-style focus sessions, and let AI break big goals into clear tasks."
        path="/"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }} />

      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <img src="/brand/focusflow-logo.png" alt="" />
            <span>FocusFlow</span>
          </Link>

          <nav className="landing-nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="landing-nav-actions">
            {user ? (
              <Link to="/app" className="btn btn-primary btn-sm">
                Go to dashboard
                <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">
                  Log in
                </Link>
                <Link to="/signup" className="btn btn-primary btn-sm">
                  Get started free
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="landing-nav-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <Menu size={20} />
          </button>
        </div>

        {menuOpen && (
          <div className="landing-nav-mobile">
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            {user ? (
              <Link to="/app" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost" onClick={() => setMenuOpen(false)}>
                  Log in
                </Link>
                <Link to="/signup" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
                  Get started free
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      <main>
        <section className="landing-hero">
          <p className="landing-hero-eyebrow">Tasks, focus, and momentum — in one calm workspace</p>
          <h1>
            A calmer way to <span>finish what matters.</span>
          </h1>
          <p className="landing-hero-subtitle">
            FocusFlow pairs a clear daily task list with a focus timer, AI-powered planning, and
            progress you can actually see. No noise, no clutter — just steady work.
          </p>
          <div className="landing-hero-actions">
            <Link to={user ? '/app' : '/signup'} className="btn btn-primary btn-lg">
              {user ? 'Go to dashboard' : 'Start focusing — it\'s free'}
              <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="btn btn-ghost btn-lg">
              See how it works
            </a>
          </div>
          <ul className="landing-hero-points">
            <li><Check size={15} /> No credit card required</li>
            <li><Check size={15} /> Your data stays private to your account</li>
            <li><Check size={15} /> Free to start</li>
          </ul>

          <div className="landing-hero-preview" aria-hidden="true">
            <div className="landing-preview-card">
              <div className="landing-preview-header">
                <span className="landing-preview-dot" />
                <span className="landing-preview-dot" />
                <span className="landing-preview-dot" />
              </div>
              <div className="landing-preview-body">
                <div className="landing-preview-timer">25:00</div>
                <div className="landing-preview-row" />
                <div className="landing-preview-row short" />
                <div className="landing-preview-row" />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-features" id="features">
          <div className="landing-section-head">
            <p className="page-kicker">Everything you need</p>
            <h2>One workspace for the whole day</h2>
            <p className="landing-section-sub">
              Built for people who want fewer tabs and more finished work.
            </p>
          </div>

          <div className="landing-feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-feature-icon">
                  <f.icon size={20} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-steps" id="how-it-works">
          <div className="landing-section-head">
            <p className="page-kicker">Simple by design</p>
            <h2>Get started in minutes</h2>
          </div>

          <div className="landing-steps-grid">
            {STEPS.map((step) => (
              <div key={step.n} className="landing-step-card">
                <span className="landing-step-number">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-faq" id="faq">
          <div className="landing-section-head">
            <p className="page-kicker">Questions</p>
            <h2>Frequently asked questions</h2>
          </div>

          <div className="landing-faq-list">
            {FAQS.map((faq) => (
              <div key={faq.question} className="landing-faq-item">
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-cta-inner">
            <h2>Ready for a more focused day?</h2>
            <p>Join FocusFlow and turn your task list into finished work.</p>
            <Link to={user ? '/app' : '/signup'} className="btn btn-primary btn-lg">
              {user ? 'Go to dashboard' : 'Create your free account'}
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-brand">
            <img src="/brand/focusflow-logo.png" alt="" />
            <span>FocusFlow</span>
          </div>
          <p>&copy; {new Date().getFullYear()} FocusFlow. Made for focused work.</p>
        </div>
      </footer>
    </div>
  );
}
