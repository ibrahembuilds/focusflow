import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Seo from './Seo';

const LAST_UPDATED = 'September 2026';
// Same placeholder as PrivacyPolicy.tsx, and the same reason: a contact
// address nobody reads is worse than one that's honest about not existing
// yet. Replace before this goes live for real.
const CONTACT_EMAIL = 'support@focusflowai.site';

export default function Terms() {
  return (
    <div className="privacy-page">
      <Seo
        title="Terms of Service"
        description="The terms for using FocusFlow — plainly written, matching what the product actually does."
        path="/terms"
      />

      <header className="privacy-page-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          FocusFlow
        </Link>
      </header>

      <main className="privacy-page-main">
        <h1>Terms of Service</h1>
        <p className="privacy-updated">Last updated: {LAST_UPDATED}</p>

        <p>
          This is a plain-language description of the terms for using FocusFlow, matching what the
          product actually does rather than a generic template. It isn't legal advice, and it's worth
          a proper legal review before you rely on it for anything serious — see the note about that
          at the bottom.
        </p>

        <h2>Using FocusFlow</h2>
        <p>
          FocusFlow is free to use today. Creating an account means you agree to these terms and to
          our <Link to="/privacy">Privacy Policy</Link>, which describes what we collect and why. You
          need to be at least 13 years old to create an account. You're responsible for keeping your
          password secure and for what happens under your account.
        </p>

        <h2>Your content</h2>
        <p>
          Your tasks, profile, and anything else you type into FocusFlow are yours. We store and
          display it back to you — and, where you've chosen to share it, to other people — only to
          run the features you're actually using:
        </p>
        <ul>
          <li>
            <strong>Circles.</strong> A task you add to a circle is visible to that circle's other
            members, the same way it is in the app itself. Your personal tasks stay private unless
            you deliberately add them to a circle.
          </li>
          <li>
            <strong>Public profiles.</strong> If you turn your profile's sharing on, your display
            name, handle, bio, and whichever stats you've opted into are visible to anyone with the
            link — that's the point of the feature, and it's off by default per number, not all-or-nothing.
          </li>
          <li>
            <strong>AI Breakdown.</strong> The text of a goal you submit is sent to OpenAI's API to
            generate a subtask list — see the Privacy Policy for exactly what that involves. Treat the
            result as a starting draft: review it before you act on it, the same way you would advice
            from any assistant that hasn't met you.
          </li>
        </ul>

        <h2>Acceptable use</h2>
        <p>Fairly ordinary rules, because a couple of features here are visible to other people:</p>
        <ul>
          <li>Don't use FocusFlow for anything illegal, or to harass, threaten, or impersonate anyone.</li>
          <li>
            Don't put content in a shared circle, a public profile, or a goal sent to AI Breakdown
            that you wouldn't want attributed to your account — including anything abusive, hateful,
            or that violates someone else's rights.
          </li>
          <li>Don't try to break the service: no scraping at scale, no attempting to bypass access controls, no interfering with other accounts.</li>
        </ul>
        <p>
          We can suspend or remove an account that clearly violates these rules. We don't have a
          moderation team reviewing content proactively — this mostly relies on the rules above and on
          people reporting real problems to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Ending your account</h2>
        <p>
          You can stop using FocusFlow whenever you like. We don't yet have a self-service delete
          button — the same gap the Privacy Policy is upfront about — so for now, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your account's address and we'll
          remove your account and everything tied to it.
        </p>

        <h2>No warranty, and our liability</h2>
        <p>
          FocusFlow is provided as-is. We work to keep it reliable and your data safe, but we can't
          promise it will always be available, error-free, or exactly right for your situation —
          especially the AI-generated task suggestions, which are a starting point, not a guarantee.
          To the extent the law allows, FocusFlow isn't liable for indirect or consequential damages
          from using the service; our total liability for any claim is limited to what (if anything)
          you've paid us in the past twelve months — which, since the app is currently free, is zero.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms as the product changes — new features get new, accurate terms
          rather than these staying stale. We'll update the date at the top when we do. If a change is
          significant, we'll look for a clearer way to flag it than just this page quietly changing
          underneath you.
        </p>

        <h2>Questions</h2>
        <p>
          Reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for anything on this
          page.
        </p>

        <p style={{ fontSize: '0.8rem', opacity: 0.75, marginTop: '2.5rem' }}>
          This page was drafted to match FocusFlow's actual features rather than copied from a
          template, but it isn't a substitute for a lawyer. If FocusFlow starts handling money,
          scales past a small user base, or a dispute ever actually turns on this page, get it
          reviewed by one — particularly the liability, acceptable-use, and governing-law questions,
          the last of which this draft deliberately leaves out rather than guess at your jurisdiction.
        </p>
      </main>
    </div>
  );
}
