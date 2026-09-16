# FocusFlow Changelog

All notable changes to the FocusFlow productivity platform.

---

## [Unreleased] — Google sign-in, real photos, and private groups

### 🔑 Sign in with Google
- A "Continue with Google" / "Sign up with Google" button on both auth pages
- A new Google account is seeded automatically with the name and photo Google provides — nothing to fill in by hand
- Signing in with Google a second time returns to the same account, never a duplicate

### 🖼️ A real photo, not just an emoji
- Upload a JPG, PNG, WEBP, or GIF (up to 4MB) as your profile photo — it replaces the emoji everywhere your card appears: your own preview, your shared link, and every circle's streak board
- Swap it or drop back to an emoji any time; invalid files and oversized files are rejected before anything is sent

### 🔒 A circle can be open, or ask-to-join
- New setting when creating a circle: anyone with the code joins instantly (unchanged default), or every request needs the owner's yes first
- The owner gets an inbox — see who's asking, let them in or decline, no explanation required
- Declining isn't a ban: a declined person can ask again
- A private circle carries a lock badge so members always know which kind they're in

### 🎉 A small "that counted" moment
- Finishing a shared task in a circle now gets a brief, friendly toast — never shown for un-checking something back open

### 🧪 Tests
- 10 more Playwright tests: Google sign-up and repeat sign-in, real photo upload/replace/remove/reject, and the full ask-to-join lifecycle (request → owner's inbox → accept/decline → re-request)
- `supabase/tests` now also proves the ask-to-join flow, the owner-only inbox, and an uploaded photo flowing through the streak board — on real Postgres 16, not a mock
- A fake Google OAuth endpoint and a fake Supabase Storage API (including real multipart/form-data parsing — `supabase-js` uploads a `File` as multipart, not raw bytes) let the suite drive both features in a real browser without a real Google account

### 🐛 Fixed
- A shared profile's uploaded photo never reached the public `/u/<username>` page — `PublicProfile.tsx` built the card without passing `avatarUrl` through, and because the field was typed optional, the type checker had nothing to say about it. It's required now, so a future omission fails the build instead of shipping a silently broken photo.

---

## [Unreleased] — Profiles you can share

### 🪪 A profile of your own
- A profile page with a name, a `@username`, a bio, an emoji, and a colour — with a live preview of the exact card a friend will see
- Every profile has a link, `/u/yourname`, that opens for anyone you send it to, signed in or not; a one-tap Copy button puts it on your clipboard
- Tap any member of a circle to open their profile, straight from the streak board

### 🔒 You decide what is on it
- Four switches: share the profile at all, show your streak, show tasks finished, show focus time — each one independent
- A number you switch off is not hidden in the page, it is never sent; a profile you switch off returns nothing at all, and looks exactly like a handle nobody owns
- Task text is never shared under any setting. The shared card carries counts and dates only

### 🌍 Your day, your timezone
- A member's day now starts and ends where *they* are. A 7pm focus session in California is credited to that day on every board, including one being read in London

### 🧪 Tests
- Seven more Playwright tests cover building a card, following a shared link while signed out, each privacy switch, and opening a circle mate's profile
- One of them reads computed colours in both themes, because a CSS override that out-specified the active day silently greyed out today's square with every other test still passing
- The E2E servers are no longer reused between runs — a preview left over from an earlier session kept serving the previous bundle, so the suite passed against code that was no longer on disk

---

## [Unreleased] — Circles, usernames & an end-to-end test suite

### 👥 Circles — shared lists for students, friends, and coworkers
- Create a circle, get a 6-character invite code, and anyone with the code can join
- One shared task list per circle: everybody sees it, everybody can tick things off, and each task shows who added it and who finished it
- A "Streaks together" board shows every member's last 7 days, today's completed tasks, focus sessions, and focus time — dates and counts only, never anyone's task text
- Your private tasks stay private: row-level security only exposes a task to a circle when you deliberately add it there
- Leaving a circle keeps your own tasks and streak; only the owner can delete the circle

### 🏷️ Usernames
- Every account now has a public `@handle`, created automatically at sign-up from the email and renameable in Settings
- Handles are unique, validated in the browser and enforced by a database constraint

### 🧪 End-to-end tests
- A Playwright suite drives the production bundle in a real browser against a stand-in Supabase backend: sign-up, task saving, offline recovery, account isolation, circles, and profiles
- SQL checks run the real schema on a throwaway Postgres and assert the row-level security policies, the completion trigger, and the shared-streak function

### 🐛 Fixes
- Tasks no longer disappear from the list when the page is reloaded without a connection — the app was treating "Supabase has not resolved the session yet" as a sign-out and clearing this browser's cached tasks
- A task shared with a circle is no longer pulled into your personal Today list, where the next sync would have quietly made it private again

---

## [Unreleased] — Durable task saving

### 💾 Tasks always reach your account
- Every task add, edit, completion, delete, and focus session is queued locally before it is sent and only dropped once Supabase confirms it — a task created offline or during a dropped request still lands in your account
- Queued changes are retried automatically when the browser comes back online, when the tab regains focus, and at the next sign-in; a banner on the Tasks page shows anything still waiting, with a "Retry now" button
- A failed load no longer blanks the app: tasks and sessions stay on screen when the fetch errors, and unconfirmed local edits are merged over the server's copy
- Cached tasks are tied to the account that created them, so a second account signing in on the same browser never sees the first one's data

---

## [1.1.0] — 2026-07-20 — Accounts, SEO & AI Provider Switch

### 🔐 Authentication & Authorization
- Email/password accounts via Supabase Auth (sign up, log in, log out)
- Protected `/app/*` routes — logged-out visitors are redirected to `/login`
- Per-user data isolation: `tasks` and `timer_sessions` scoped by `user_id` with row-level security
- Tasks and focus sessions sync live to Supabase per account

### 🏠 Landing Page
- New public marketing page at `/` with hero, feature grid, "how it works" steps, and FAQ
- Responsive nav with mobile menu

### 🔍 SEO / AIO / GEO
- Full meta tags: description, canonical URL, Open Graph, Twitter Cards
- JSON-LD structured data: `SoftwareApplication`, `Organization`, `FAQPage`
- `robots.txt` (with explicit AI-crawler allowances), `sitemap.xml`, `llms.txt`, and a web app manifest
- Per-route `<title>`/meta via a lightweight `Seo` component; private `/app/*` pages marked `noindex`

### 🧠 AI Task Decomposition
- Switched provider from OpenRouter to the OpenAI API directly (`OPENAI_API_KEY`, `OPENAI_MODEL`)

### 📱 Responsive fixes
- iOS safe-area padding for the mobile bottom nav and toasts
- Overflow fixes on narrow phones across Analytics, Timer, Settings, and Calendar

---

## [1.0.0] — 2026-07-13 — Initial Release 🚀

### Complete Rewrite from Promda
- Complete architecture upgrade from single HTML file to React 18 + TypeScript + Vite
- Premium dark-themed design system with custom CSS (Linear/Things 3 inspired)
- State management via Zustand with localStorage persistence
- Client-side routing with React Router v7

### 🎯 Focus Timer
- Circular SVG progress ring with smooth animations
- Work/Break cycle automation with audio chimes
- Quick presets: 25m, 45m, 60m focus / 5m, 10m, 15m break
- Task-linked sessions — select what you're working on
- Pause, resume, stop, skip break controls
- Auto-records completed sessions to analytics

### 🧠 AI Task Decomposition
- OpenRouter API integration (GPT-4o-mini by default)
- Natural language goal input → AI generates 4-8 actionable subtasks
- Example goals to try (Launch store, Plan wedding, Learn TS, etc.)
- One-click "Add All to Today" into task list
- API key management in Settings
- Fallback parsing for resilient JSON extraction

### 📋 Task Manager
- Drag-and-drop reordering via @dnd-kit
- Priority levels: Low, Medium, High with color badges
- Task completion tracking with session counts (🍅)
- Active/Completed task sections
- One-click "Start Focus" jumps to timer with task pre-selected
- AI-generated tasks appear as banner with Add All / Dismiss

### 📊 Dashboard & Analytics
- Live stats: Tasks Done, Total Sessions, Focus Time, Active Tasks
- Weekly bar chart (Sessions + Completed per day) via Recharts
- Priority breakdown pie chart
- Weekly breakdown table with per-day metrics
- Quick-launch to Focus Timer from dashboard

### 📅 Calendar
- Monthly calendar grid with navigation
- Task dot indicators on days with activity
- Click any day to see tasks created on that date
- "Today" quick-jump button

### ⚙️ Settings
- OpenRouter API key configuration
- Default timer/break duration preferences
- Data export (JSON backup download)
- Full data reset with confirmation
- About section with app info

### 🎨 Design & UX
- Dark theme (Linear-inspired) with CSS custom properties
- Glass morphism surfaces with backdrop blur
- Smooth transitions and hover effects (150ms-400ms cubic-bezier)
- Animated page transitions (fadeIn)
- Pulsing glow effects on active states
- Custom scrollbar styling
- Inter + JetBrains Mono typography
- Lucide React icon set throughout
- Fully responsive: sidebar collapses on mobile, grid adapts
- Tabular-nums for all number displays

### 🏗️ Architecture
- React 18 + TypeScript + Vite 8
- Zustand store with persist middleware
- @dnd-kit/core + @dnd-kit/sortable for drag-and-drop
- Recharts for data visualization
- Framer Motion (available for future animations)
- date-fns for date utilities
- OpenRouter REST API for AI features
- Zero backend dependencies — 100% client-side

### 📦 Build
- Production bundle: 15KB CSS + 694KB JS (208KB gzipped)
- TypeScript strict mode, zero errors
- Vite code-splitting ready

---

## Prior History (Promda)

### [Unreleased] — 2026-07-07
- Minor maintenance and housekeeping

### Initial
- Single-file HTML Pomodoro timer + task manager
- Vanilla JS with localStorage persistence
- 25min work / 5min break cycles
- Task CRUD with session tracking
- Glassmorphism UI with Inter font
