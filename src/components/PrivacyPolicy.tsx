import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Seo from './Seo';

const LAST_UPDATED = 'September 2026';
// TODO before this goes live for real: replace with FocusFlow's actual
// support address. A privacy policy that names an address nobody reads
// is worse than one that's honest about not having one yet.
const CONTACT_EMAIL = 'privacy@focusflowai.site';

export default function PrivacyPolicy() {
  return (
    <div className="privacy-page">
      <Seo
        title="Privacy Policy"
        description="What FocusFlow collects, why, and who it's shared with."
        path="/privacy"
      />

      <header className="privacy-page-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          FocusFlow
        </Link>
      </header>

      <main className="privacy-page-main">
        <h1>Privacy Policy</h1>
        <p className="privacy-updated">Last updated: {LAST_UPDATED}</p>

        <p>
          This page describes what FocusFlow actually stores about you, in plain language, matching
          what the product does rather than a generic template. If something here ever stops
          matching the app, that's a bug in the app or in this page — tell us.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account basics.</strong> Your email address and a hashed password, or — if you
            choose to continue with Google — the name, email, and profile photo Google shares with
            us for that sign-in.
          </li>
          <li>
            <strong>What you type into the app.</strong> Tasks, task priorities, focus-session
            history, and anything you add to your profile: display name, username, bio, and an
            uploaded photo.
          </li>
          <li>
            <strong>Circles.</strong> If you create or join a circle, other members can see tasks you
            explicitly add to that circle, your username, and — only if you've switched them on in
            Settings — your streak, tasks-finished count, and focus time. Your personal tasks are
            never visible to a circle unless you deliberately add them there.
          </li>
          <li>
            <strong>Goals you send to AI Breakdown.</strong> The text of any goal you submit to the
            AI task-breakdown feature is sent to OpenAI's API to generate the subtask list. We don't
            store that text separately from the tasks it produces — the ones you keep are just tasks
            like any other.
          </li>
          <li>
            <strong>Technical basics.</strong> Your session token (so you stay signed in), your theme
            and colour preference, and — only after you accept the cookie banner — anonymous,
            aggregate site analytics.
          </li>
        </ul>

        <h2>Where it's stored, and who else sees it</h2>
        <p>FocusFlow is built on a small number of services, each with one job:</p>
        <ul>
          <li>
            <strong>Supabase</strong> hosts our database, authentication, and uploaded photos.
            Row-level security is enforced at the database level: a task is only readable by you,
            or by the members of a circle you deliberately shared it with — never by "anyone with
            database access" in the abstract.
          </li>
          <li>
            <strong>OpenAI</strong> processes the text of goals submitted to AI Breakdown, per
            their own privacy terms. Nothing else you do in the app is sent to OpenAI.
          </li>
          <li>
            <strong>Google</strong> is only involved if you choose "Continue with Google" to sign in.
          </li>
          <li>
            <strong>Vercel</strong> hosts the site and, only with your consent, provides anonymous
            visit analytics (page views and rough performance — no individual tracking, no
            cross-site cookies).
          </li>
        </ul>
        <p>We do not sell your data, and we don't share it with anyone else not listed above.</p>

        <h2>Cookies and local storage</h2>
        <p>
          Signing in relies on your browser's local storage to hold your session — that part is
          required for the app to work and isn't a choice we can offer around. The one thing that is
          optional is site analytics, which stays off until you accept the cookie banner, and which
          you can decline without losing any functionality.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>
            <strong>Export.</strong> Settings → Data management → Export data downloads your tasks
            and sessions as a file you keep.
          </li>
          <li>
            <strong>Profile sharing.</strong> Your profile page has switches for exactly what's
            visible on your public link — off means off, nothing is sent to view it.
          </li>
          <li>
            <strong>Delete your account.</strong> We don't yet have a self-service delete button.
            Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your account's address
            and we'll remove your account and everything tied to it.
          </li>
        </ul>

        <h2>Questions</h2>
        <p>
          Reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for anything on this
          page, or about your data specifically.
        </p>
      </main>
    </div>
  );
}
