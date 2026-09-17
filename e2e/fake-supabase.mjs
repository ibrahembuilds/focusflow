/**
 * A test double for the Supabase endpoints FocusFlow talks to: the GoTrue auth
 * routes and the PostgREST table/RPC routes, backed by plain JavaScript objects.
 *
 * It exists so the E2E suite can drive the *real* production bundle in a real
 * browser without a live project. It deliberately mirrors the access rules in
 * supabase/schema.sql and supabase/migrations/002_profiles_and_circles.sql —
 * when you change a policy there, change the matching check in `canRead` /
 * `canWrite` here, or the tests will stop telling you the truth.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54331);

// ── Storage ──────────────────────────────────────────────────────────────────

const db = {
  users: new Map(), // id -> { id, email, password, user_metadata, created_at }
  sessions: new Map(), // refresh_token -> userId
  profiles: [],
  circles: [],
  circle_members: [],
  circle_join_requests: [], // { circle_id, user_id, requested_at }
  tasks: [],
  timer_sessions: [],
};

// Uploaded files: `${bucket}/${path}` -> { bytes: Buffer, contentType: string }.
// A stand-in for Supabase Storage, exercised the same way the SQL migration's
// avatars bucket is: authenticated upload under your own user id, public read.
const storage = new Map();

let insertCounter = 0;

function reset() {
  db.users.clear();
  db.sessions.clear();
  db.profiles = [];
  db.circles = [];
  db.circle_members = [];
  db.circle_join_requests = [];
  db.tasks = [];
  db.timer_sessions = [];
  storage.clear();
  insertCounter = 0;
}

// ── Tokens ───────────────────────────────────────────────────────────────────

const b64url = (value) => Buffer.from(value).toString('base64url');

/** A structurally valid JWT. Nothing verifies the signature; auth-js decodes it. */
function makeJwt(claims) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000), ...claims }));
  return `${header}.${payload}.${b64url('fake-signature')}`;
}

function userIdFromRequest(req) {
  const header = req.headers.authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.created_at,
    phone: '',
    confirmed_at: user.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: user.user_metadata,
    identities: [],
    created_at: user.created_at,
    updated_at: new Date().toISOString(),
  };
}

function sessionFor(user) {
  const refreshToken = randomUUID();
  db.sessions.set(refreshToken, user.id);
  const expiresIn = 3600;
  return {
    access_token: makeJwt({
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + expiresIn,
    }),
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: refreshToken,
    user: publicUser(user),
  };
}

// ── Row-level security, mirrored from the SQL policies ───────────────────────

const isMember = (circleId, userId) =>
  db.circle_members.some((m) => m.circle_id === circleId && m.user_id === userId);

const isOwner = (circleId, userId) =>
  db.circles.some((c) => c.id === circleId && c.owner_id === userId);

function canRead(table, row, userId) {
  if (!userId) return false;
  switch (table) {
    case 'profiles':
      return true;
    case 'circles':
      return row.owner_id === userId || isMember(row.id, userId);
    case 'circle_members':
      return row.user_id === userId || isMember(row.circle_id, userId);
    case 'tasks':
      return row.user_id === userId || (row.circle_id != null && isMember(row.circle_id, userId));
    case 'timer_sessions':
      return row.user_id === userId;
    default:
      return false;
  }
}

function canWrite(table, row, userId, operation) {
  if (!userId) return false;
  switch (table) {
    case 'profiles':
      return row.id === userId;
    case 'circles':
      return row.owner_id === userId;
    case 'circle_members':
      return operation === 'delete'
        ? row.user_id === userId || isOwner(row.circle_id, userId)
        : row.user_id === userId;
    case 'tasks':
      if (operation === 'delete') {
        return row.user_id === userId || (row.circle_id != null && isOwner(row.circle_id, userId));
      }
      return row.user_id === userId || (row.circle_id != null && isMember(row.circle_id, userId));
    case 'timer_sessions':
      return row.user_id === userId;
    default:
      return false;
  }
}

// ── PostgREST query semantics ────────────────────────────────────────────────

function applyFilters(rows, params) {
  let result = rows;
  for (const [column, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(column)) continue;
    const [operator, ...rest] = raw.split('.');
    const value = rest.join('.');
    if (operator === 'eq') result = result.filter((row) => String(row[column]) === value);
    else if (operator === 'is') {
      result = result.filter((row) =>
        value === 'null' ? row[column] == null : row[column] != null,
      );
    } else if (operator === 'in') {
      const list = value.replace(/^\(|\)$/g, '').split(',');
      result = result.filter((row) => list.includes(String(row[column])));
    }
  }
  return result;
}

function applyOrder(rows, params) {
  const order = params.get('order');
  if (!order) return rows;
  const [column, ...modifiers] = order.split('.');
  const descending = modifiers.includes('desc');
  return [...rows].sort((a, b) => {
    const left = a[column] ?? '';
    const right = b[column] ?? '';
    if (left === right) return 0;
    return (left < right ? -1 : 1) * (descending ? -1 : 1);
  });
}

/** Mirrors the `tasks_stamp_completion` trigger. */
function stampCompletion(row, previous, userId) {
  if (row.completed && !previous?.completed) {
    row.completed_by = userId ?? row.user_id;
    row.completed_at = new Date().toISOString();
  } else if (!row.completed) {
    row.completed_by = null;
    row.completed_at = null;
  }
  return row;
}

function defaultsFor(table, body) {
  const base = { id: body.id ?? randomUUID(), inserted_at: String(++insertCounter).padStart(8, '0') };
  if (table === 'tasks') {
    return {
      ...base,
      completed: false,
      sessions: 0,
      priority: 'medium',
      project_id: null,
      due_date: null,
      circle_id: null,
      completed_by: null,
      completed_at: null,
      ...body,
    };
  }
  return { ...base, ...body };
}

// ── RPCs, mirroring the SQL functions ────────────────────────────────────────

const rpcs = {
  create_circle(body, userId) {
    if (!userId) return { status: 401, body: { code: '42501', message: 'sign in required' } };
    const name = String(body.circle_name ?? '').trim();
    if (!name) return { status: 400, body: { code: '22023', message: 'circle name is required' } };

    let code;
    do {
      code = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    } while (db.circles.some((circle) => circle.invite_code === code));

    const circle = {
      id: randomUUID(),
      name: name.slice(0, 60),
      emoji: body.circle_emoji || '🎯',
      owner_id: userId,
      invite_code: code,
      created_at: new Date().toISOString(),
      require_approval: false,
    };
    db.circles.push(circle);
    db.circle_members.push({
      circle_id: circle.id,
      user_id: userId,
      role: 'owner',
      joined_at: new Date().toISOString(),
    });
    return { status: 200, body: circle };
  },

  /** Mirrors the rewritten SQL function of the same name: answers with what
   *  actually happened rather than assuming a code always means "you're in". */
  join_circle_by_code(body, userId) {
    if (!userId) return { status: 401, body: { code: '42501', message: 'sign in required' } };
    const code = String(body.code ?? '').trim().toUpperCase();
    const circle = db.circles.find((item) => item.invite_code === code);
    if (!circle) {
      return { status: 400, body: { code: 'P0002', message: 'no circle with that invite code' } };
    }

    const row = (status) => [
      {
        status,
        circle_id: circle.id,
        circle_name: circle.name,
        circle_emoji: circle.emoji,
        invite_code: circle.invite_code,
        owner_id: circle.owner_id,
        created_at: circle.created_at,
        require_approval: circle.require_approval,
      },
    ];

    if (isMember(circle.id, userId)) {
      return { status: 200, body: row('already_member') };
    }

    if (!circle.require_approval) {
      db.circle_members.push({
        circle_id: circle.id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      });
      return { status: 200, body: row('joined') };
    }

    if (!db.circle_join_requests.some((r) => r.circle_id === circle.id && r.user_id === userId)) {
      db.circle_join_requests.push({ circle_id: circle.id, user_id: userId, requested_at: new Date().toISOString() });
    }
    return { status: 200, body: row('pending') };
  },

  /** Owner-only, same as the SQL function: everyone else gets refused. */
  list_join_requests(body, userId) {
    const circleId = body.target_circle;
    if (!isOwner(circleId, userId)) {
      return { status: 403, body: { code: '42501', message: 'only the circle owner can see join requests' } };
    }
    const requests = db.circle_join_requests
      .filter((r) => r.circle_id === circleId)
      .sort((a, b) => a.requested_at.localeCompare(b.requested_at));

    return {
      status: 200,
      body: requests.map((r) => {
        const profile = db.profiles.find((p) => p.id === r.user_id);
        return {
          user_id: r.user_id,
          username: profile?.username ?? null,
          display_name: profile?.display_name ?? null,
          avatar_emoji: profile?.avatar_emoji ?? '🌱',
          avatar_color: profile?.avatar_color ?? 'forest',
          avatar_url: profile?.avatar_url ?? null,
          requested_at: r.requested_at,
        };
      }),
    };
  },

  /** Owner-only. Accepting adds the member; declining just clears the row —
   *  there is no separate "declined" state, so asking again later is allowed. */
  respond_to_join_request(body, userId) {
    const circleId = body.target_circle;
    const requester = body.requester;
    if (!isOwner(circleId, userId)) {
      return { status: 403, body: { code: '42501', message: 'only the circle owner can respond to a join request' } };
    }

    db.circle_join_requests = db.circle_join_requests.filter(
      (r) => !(r.circle_id === circleId && r.user_id === requester),
    );
    if (body.accept) {
      db.circle_members.push({
        circle_id: circleId,
        user_id: requester,
        role: 'member',
        joined_at: new Date().toISOString(),
      });
    }
    return { status: 200, body: null };
  },

  circle_activity(body, userId) {
    const circleId = body.target_circle;
    if (!isMember(circleId, userId)) {
      return { status: 403, body: { code: '42501', message: 'not a member of this circle' } };
    }
    const today = body.client_today ?? new Date().toISOString().slice(0, 10);
    const members = db.circle_members.filter((member) => member.circle_id === circleId);

    return {
      status: 200,
      body: members.map((member) => {
        const profile = db.profiles.find((item) => item.id === member.user_id);
        // The member's own offset wins, exactly as in circle_activity: a reader
        // in London must not move a teammate's day in California.
        const stats = activityFor(
          member.user_id,
          profile?.tz_offset_minutes ?? body.client_tz_offset_minutes ?? 0,
        );

        return {
          user_id: member.user_id,
          username: profile?.username ?? null,
          display_name: profile?.display_name ?? null,
          role: member.role,
          avatar_emoji: profile?.avatar_emoji ?? '🌱',
          avatar_color: profile?.avatar_color ?? 'forest',
          avatar_url: profile?.avatar_url ?? null,
          completed_today: stats.tasks.filter((task) => task.created_at === today).length,
          sessions_today: stats.sessions.filter((s) => stats.localDay(s.timestamp) === today).length,
          focus_seconds_today: stats.sessions
            .filter((s) => stats.localDay(s.timestamp) === today)
            .reduce((total, s) => total + s.duration, 0),
          active_dates: stats.activeDates,
        };
      }),
    };
  },

  public_profile(body) {
    const handle = String(body.handle ?? '').trim().toLowerCase();
    const owner = db.profiles.find((item) => item.username === handle && item.is_public);
    // A handle nobody owns and one kept private look identical from outside.
    if (!owner) return { status: 200, body: [] };

    const stats = activityFor(owner.id, owner.tz_offset_minutes ?? 0);
    return {
      status: 200,
      body: [
        {
          username: owner.username,
          display_name: owner.display_name,
          bio: owner.bio,
          avatar_emoji: owner.avatar_emoji,
          avatar_color: owner.avatar_color,
          avatar_url: owner.avatar_url ?? null,
          member_since: owner.created_at,
          tz_offset_minutes: owner.tz_offset_minutes ?? 0,
          show_streak: owner.show_streak,
          show_focus_time: owner.show_focus_time,
          show_completed: owner.show_completed,
          completed_total: owner.show_completed ? stats.tasks.length : null,
          focus_seconds_total: owner.show_focus_time
            ? stats.sessions.reduce((total, s) => total + s.duration, 0)
            : null,
          active_dates: owner.show_streak ? stats.activeDates : null,
        },
      ],
    };
  },
};

/**
 * One member's finished work, with days measured against `offsetMinutes`
 * (`Date.getTimezoneOffset()`: minutes behind UTC, so UTC-08:00 passes 480).
 */
function activityFor(memberId, offsetMinutes) {
  const localDay = (timestamp) =>
    new Date(Date.parse(timestamp) - offsetMinutes * 60_000).toISOString().slice(0, 10);

  const tasks = db.tasks.filter(
    (task) => task.completed && (task.completed_by ?? task.user_id) === memberId,
  );
  const sessions = db.timer_sessions.filter(
    (session) => session.completed && session.user_id === memberId,
  );
  const activeDates = [
    ...new Set([...tasks.map((task) => task.created_at), ...sessions.map((s) => localDay(s.timestamp))]),
  ].sort();

  return { tasks, sessions, activeDates, localDay };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'content-range, x-supabase-api-version',
};

function send(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Registers a new account and its profile — the same shape the real
 * `on_auth_user_created` trigger produces, whether the account came from
 * email/password `/signup` or the Google stand-in at `/authorize`.
 */
function createUserAndProfile(email, metadata, password = '') {
  const user = {
    id: randomUUID(),
    email,
    password,
    user_metadata: metadata,
    created_at: new Date().toISOString(),
  };
  db.users.set(user.id, user);

  let username = email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'focususer';
  if (username.length < 3) username += 'focus';
  let candidate = username;
  let suffix = 0;
  while (db.profiles.some((profile) => profile.username === candidate)) {
    suffix += 1;
    candidate = `${username}${suffix}`;
  }

  // Email/password sign-up sets `fullName`; Google (and most OAuth providers)
  // set `full_name` / `name` and `avatar_url` instead — mirrors
  // migration 004's rewrite of handle_new_user().
  const displayName = metadata?.fullName || metadata?.full_name || metadata?.name || null;

  db.profiles.push({
    id: user.id,
    username: candidate,
    display_name: displayName,
    bio: null,
    avatar_emoji: '🌱',
    avatar_color: 'forest',
    avatar_url: metadata?.avatar_url || null,
    is_public: true,
    show_streak: true,
    show_focus_time: true,
    show_completed: true,
    tz_offset_minutes: 0,
    created_at: user.created_at,
  });

  return user;
}

function handleAuth(req, res, url, body) {
  const path = url.pathname.replace('/auth/v1', '');

  if (path === '/signup') {
    const email = String(body?.email ?? '').toLowerCase();
    if ([...db.users.values()].some((user) => user.email === email)) {
      return send(res, 400, { error_code: 'user_already_exists', msg: 'User already registered' });
    }
    const user = createUserAndProfile(email, body?.data ?? {}, body?.password ?? '');
    return send(res, 200, sessionFor(user));
  }

  // Stands in for Google. There is no real Google here — this issues a
  // session directly, the same way a real IdP redirect eventually does, so
  // the app's OAuth *plumbing* (redirect out, parse the session back from the
  // URL, land signed in) is exercised end to end. It does not, and cannot,
  // prove anything about Google's own consent screen.
  if (path === '/authorize') {
    const redirectTo = url.searchParams.get('redirect_to') || `${url.origin}/app`;
    // A real "Sign in with Google" button never sends this; it exists so a
    // test can simulate the *same person* completing OAuth a second time,
    // by rewriting the outgoing request (see e2e/helpers.ts) rather than by
    // teaching the production button to send a test-only parameter.
    const loginHint = url.searchParams.get('login_hint');
    const email = (loginHint || `google.${randomUUID().slice(0, 8)}@gmail.test`).toLowerCase();

    let user = [...db.users.values()].find((item) => item.email === email);
    if (!user) {
      user = createUserAndProfile(email, {
        full_name: 'Google User',
        avatar_url: `https://lh3.googleusercontent.com/fake-avatar/${encodeURIComponent(email)}`,
        provider: 'google',
      });
    }

    const session = sessionFor(user);
    const hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in),
      expires_at: String(session.expires_at),
      token_type: session.token_type,
      provider_token: 'fake-google-provider-token',
    });
    res.writeHead(302, { ...CORS, Location: `${redirectTo}#${hash.toString()}` });
    return res.end();
  }

  if (path === '/token') {
    const grantType = url.searchParams.get('grant_type');
    if (grantType === 'refresh_token') {
      const userId = db.sessions.get(body?.refresh_token);
      const user = userId ? db.users.get(userId) : null;
      if (!user) return send(res, 400, { error_code: 'invalid_grant', msg: 'Invalid Refresh Token' });
      return send(res, 200, sessionFor(user));
    }
    const email = String(body?.email ?? '').toLowerCase();
    const user = [...db.users.values()].find(
      (item) => item.email === email && item.password === body?.password,
    );
    if (!user) {
      return send(res, 400, {
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials',
        message: 'Invalid login credentials',
      });
    }
    return send(res, 200, sessionFor(user));
  }

  if (path === '/user') {
    const userId = userIdFromRequest(req);
    const user = userId ? db.users.get(userId) : null;
    if (!user) return send(res, 401, { msg: 'invalid claim: missing sub claim' });

    if (req.method === 'PUT') {
      if (body?.data) user.user_metadata = { ...user.user_metadata, ...body.data };
      if (body?.password) user.password = body.password;
      if (body?.email) user.email = String(body.email).toLowerCase();
    }
    return send(res, 200, publicUser(user));
  }

  if (path === '/logout') return send(res, 204, undefined);
  if (path === '/recover') return send(res, 200, {});

  return send(res, 404, { msg: `unhandled auth route ${path}` });
}

function handleRest(req, res, url, body) {
  const userId = userIdFromRequest(req);
  const prefer = req.headers.prefer ?? '';
  const wantsObject = String(req.headers.accept ?? '').includes('application/vnd.pgrst.object+json');
  const wantsRows = prefer.includes('return=representation') || req.method === 'GET';
  const path = url.pathname.replace('/rest/v1/', '');

  if (path.startsWith('rpc/')) {
    const name = path.slice(4);
    const rpc = rpcs[name];
    if (!rpc) return send(res, 404, { code: '42883', message: `function ${name} does not exist` });
    // `public_profile` is granted to anon in SQL, so it must answer here too.
    const result = rpc(body ?? {}, userId);
    return send(res, result.status, result.body);
  }

  const table = path;
  if (!(table in db)) {
    return send(res, 404, { code: '42P01', message: `relation ${table} does not exist` });
  }

  const respond = (rows, status = 200) => {
    if (!wantsRows) return send(res, 204, undefined);
    if (wantsObject) {
      if (rows.length !== 1) {
        return send(res, 406, {
          code: 'PGRST116',
          details: `Results contain ${rows.length} rows`,
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned',
        });
      }
      return send(res, status, rows[0]);
    }
    return send(res, status, rows);
  };

  if (req.method === 'GET' || req.method === 'HEAD') {
    const visible = db[table].filter((row) => canRead(table, row, userId));
    return respond(applyOrder(applyFilters(visible, url.searchParams), url.searchParams));
  }

  if (req.method === 'POST') {
    const upsert = prefer.includes('resolution=merge-duplicates');
    const incoming = Array.isArray(body) ? body : [body];
    const written = [];

    for (const item of incoming) {
      const existingIndex = db[table].findIndex(
        (row) => item.id != null && String(row.id) === String(item.id),
      );

      // profiles.username is UNIQUE — no account may take a handle another one
      // already holds, whether the row is new or being renamed.
      if (table === 'profiles' && db.profiles.some((p) => p.username === item.username && p.id !== item.id)) {
        return send(res, 409, {
          code: '23505',
          message: 'duplicate key value violates unique constraint "profiles_username_key"',
        });
      }

      if (existingIndex !== -1) {
        if (!upsert) {
          return send(res, 409, {
            code: '23505',
            message: `duplicate key value violates unique constraint "${table}_pkey"`,
          });
        }
        const previous = db[table][existingIndex];
        if (!canWrite(table, previous, userId, 'update') || !canWrite(table, item, userId, 'update')) {
          return send(res, 403, {
            code: '42501',
            message: `new row violates row-level security policy for table "${table}"`,
          });
        }
        const merged = { ...previous, ...item };
        if (table === 'tasks') stampCompletion(merged, previous, userId);
        db[table][existingIndex] = merged;
        written.push(merged);
        continue;
      }

      const row = defaultsFor(table, item);
      if (!canWrite(table, row, userId, 'insert')) {
        return send(res, 403, {
          code: '42501',
          message: `new row violates row-level security policy for table "${table}"`,
        });
      }
      if (table === 'tasks') stampCompletion(row, null, userId);
      db[table].push(row);
      written.push(row);
    }
    return respond(written, 201);
  }

  if (req.method === 'PATCH') {
    const targets = applyFilters(db[table], url.searchParams).filter((row) =>
      canRead(table, row, userId),
    );
    const written = [];
    for (const row of targets) {
      if (!canWrite(table, row, userId, 'update')) {
        return send(res, 403, {
          code: '42501',
          message: `new row violates row-level security policy for table "${table}"`,
        });
      }
      const index = db[table].indexOf(row);
      const merged = { ...row, ...body };
      if (table === 'tasks') stampCompletion(merged, row, userId);
      db[table][index] = merged;
      written.push(merged);
    }
    return respond(written);
  }

  if (req.method === 'DELETE') {
    const targets = applyFilters(db[table], url.searchParams).filter((row) =>
      canWrite(table, row, userId, 'delete'),
    );
    for (const row of targets) {
      db[table].splice(db[table].indexOf(row), 1);
      // `on delete cascade` for circles.
      if (table === 'circles') {
        db.circle_members = db.circle_members.filter((m) => m.circle_id !== row.id);
        db.tasks = db.tasks.filter((task) => task.circle_id !== row.id);
      }
    }
    return respond(targets);
  }

  return send(res, 405, { message: `unsupported method ${req.method}` });
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * supabase-js uploads a File/Blob as multipart/form-data (see `uploadOrUpdate`
 * in @supabase/storage-js — it appends the file under an empty field name
 * alongside a `cacheControl` text field), not as a raw request body. Pulling
 * just the file part out is what lets a stored avatar come back as a real,
 * loadable image instead of a multipart envelope.
 */
function parseMultipartFile(buffer, contentTypeHeader) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader || '');
  const boundary = boundaryMatch ? boundaryMatch[1] || boundaryMatch[2] : null;
  if (!boundary) return null;

  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    const next = buffer.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    let chunk = buffer.subarray(start + delimiter.length, next);
    if (chunk.subarray(0, 2).toString('latin1') === '--') break; // terminal boundary
    if (chunk[0] === 0x0d && chunk[1] === 0x0a) chunk = chunk.subarray(2); // boundary's own CRLF
    if (chunk.subarray(-2).toString('latin1') === '\r\n') chunk = chunk.subarray(0, -2);
    parts.push(chunk);
    start = next;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    // Only the actual file part carries a filename — `cacheControl` and any
    // other plain fields don't, which is how we tell them apart.
    if (!/filename="/i.test(headerText)) continue;
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    return {
      bytes: part.subarray(headerEnd + 4),
      contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
    };
  }
  return null;
}

/**
 * A minimal stand-in for the Supabase Storage object API: upload under
 * `avatars/<user_id>/...` (checked against the caller's own id, the same
 * boundary `storage.foldername(name))[1] = auth.uid()::text` draws in
 * migration 004) and serve it back from the public read path.
 */
async function handleStorage(req, res, url) {
  const userId = userIdFromRequest(req);
  // Path shape: /storage/v1/object/[public/]<bucket>/<...path>
  const parts = url.pathname.replace('/storage/v1/object/', '').split('/');
  const isPublicRead = parts[0] === 'public';
  if (isPublicRead) parts.shift();
  const bucket = parts.shift();
  const objectPath = parts.join('/');
  const key = `${bucket}/${objectPath}`;

  if (req.method === 'GET') {
    const object = storage.get(key);
    if (!object) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { ...CORS, 'Content-Type': object.contentType, 'Content-Length': object.bytes.length });
    return res.end(object.bytes);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!userId) return send(res, 400, { statusCode: '401', error: 'Unauthorized', message: 'sign in required' });
    // Every avatar path starts with the uploader's own id — the one rule the
    // real bucket policy enforces via storage.foldername(name).
    if (bucket === 'avatars' && parts[0] !== userId) {
      return send(res, 400, {
        statusCode: '403',
        error: 'Unauthorized',
        message: 'new row violates row-level security policy',
      });
    }
    if (req.method === 'POST' && storage.has(key)) {
      return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    }
    const raw = await readRawBody(req);
    const contentTypeHeader = req.headers['content-type'] || '';
    // A File/Blob upload arrives as multipart; anything else (a test posting
    // raw bytes directly) is stored as-is.
    const parsed = contentTypeHeader.startsWith('multipart/form-data')
      ? parseMultipartFile(raw, contentTypeHeader)
      : { bytes: raw, contentType: contentTypeHeader || 'application/octet-stream' };
    if (!parsed) {
      return send(res, 400, { statusCode: '400', error: 'invalid_request', message: 'No file found in upload' });
    }
    storage.set(key, parsed);
    return send(res, 200, { Key: key });
  }

  if (req.method === 'DELETE') {
    if (bucket === 'avatars' && parts[0] !== userId) {
      return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'not your object' });
    }
    storage.delete(key);
    return send(res, 200, [{ name: objectPath }]);
  }

  return send(res, 405, { message: `unsupported method ${req.method}` });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Storage reads its own raw bytes — the generic JSON body reader below
  // would silently swallow an uploaded image.
  if (url.pathname.startsWith('/storage/v1/object/')) {
    try {
      return await handleStorage(req, res, url);
    } catch (cause) {
      return send(res, 500, { message: cause instanceof Error ? cause.message : 'unknown error' });
    }
  }

  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : null;

  try {
    if (url.pathname === '/__test/reset') {
      reset();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/__test/state') {
      return send(res, 200, {
        users: [...db.users.values()].map((user) => ({ id: user.id, email: user.email })),
        profiles: db.profiles,
        circles: db.circles,
        circle_members: db.circle_members,
        circle_join_requests: db.circle_join_requests,
        tasks: db.tasks,
        timer_sessions: db.timer_sessions,
      });
    }
    if (url.pathname === '/__test/health') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/auth/v1')) return handleAuth(req, res, url, body);
    if (url.pathname.startsWith('/rest/v1')) return handleRest(req, res, url, body);
    return send(res, 404, { message: `unhandled path ${url.pathname}` });
  } catch (cause) {
    return send(res, 500, { message: cause instanceof Error ? cause.message : 'unknown error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`fake supabase listening on http://127.0.0.1:${PORT}`);
});
