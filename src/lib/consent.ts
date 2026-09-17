import { useEffect, useState } from 'react';

/**
 * Cookie/local-storage consent. FocusFlow doesn't use tracking cookies —
 * signing in relies on Supabase's session in localStorage, which is required
 * for the app to work at all and isn't something a visitor can opt out of and
 * still use the product. The one genuinely optional thing is Vercel Web
 * Analytics, which this consent gates: nothing analytics-related loads until
 * the visitor says yes.
 */

export type ConsentChoice = 'accepted' | 'declined';

const STORAGE_KEY = 'focusflow-cookie-consent';
// Fired on the same tab a choice was made in — `storage` events don't reach
// the tab that wrote them, and this banner and the analytics gate live in
// the same tab.
const CHANGE_EVENT = 'focusflow-cookie-consent-change';

function readConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'accepted' || raw === 'declined' ? raw : null;
  } catch {
    // Private browsing, blocked storage, etc. Treat as "no choice yet" — the
    // banner will just reappear next visit rather than the app crashing.
    return null;
  }
}

export function setConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // If storage is blocked there's nowhere durable to record the choice;
    // the in-memory event below still lets this tab honor it for the
    // session, which is the best available fallback.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: choice }));
}

/** The current choice, and whether it's still unmade. */
export function useCookieConsent() {
  const [choice, setChoice] = useState<ConsentChoice | null>(() => readConsent());

  useEffect(() => {
    const handle = (event: Event) => {
      setChoice((event as CustomEvent<ConsentChoice>).detail);
    };
    window.addEventListener(CHANGE_EVENT, handle);
    return () => window.removeEventListener(CHANGE_EVENT, handle);
  }, []);

  return choice;
}
