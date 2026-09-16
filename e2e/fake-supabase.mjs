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
  tasks: [],
  timer_sessions: [],
};

let insertCounter = 0;

function reset() {
  db.users.clear();
  db.sessions.clear();
  db.profiles = [];
  db.circles = [];
  db.circle_members = [];
  db.tasks = [];
  db.timer_sessions = [];
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

  join_circle_by_code(body, userId) {
    if (!userId) return { status: 401, body: { code: '42501', message: 'sign in required' } };
    const code = String(body.code ?? '').trim().toUpperCase();
    const circle = db.circles.find((item) => item.invite_code === code);
    if (!circle) {
      return { status: 400, body: { code: 'P0002', message: 'no circle with that invite code' } };
    }
    if (!isMember(circle.id, userId)) {
      db.circle_members.push({
        circle_id: circle.id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      });
    }
    return { status: 200, body: circle };
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
        const ownTasks = db.tasks.filter(
          (task) => task.completed && (task.completed_by ?? task.user_id) === member.user_id,
        );
        const ownSessions = db.timer_sessions.filter(
          (session) => session.completed && session.user_id === member.user_id,
        );
        const dates = new Set([
          ...ownTasks.map((task) => task.created_at),
          ...ownSessions.map((session) => session.timestamp.slice(0, 10)),
        ]);

        return {
          user_id: member.user_id,
          username: profile?.username ?? null,
          display_name: profile?.display_name ?? null,
          role: member.role,
          completed_today: ownTasks.filter((task) => task.created_at === today).length,
          sessions_today: ownSessions.filter((s) => s.timestamp.slice(0, 10) === today).length,
          focus_seconds_today: ownSessions
            .filter((s) => s.timestamp.slice(0, 10) === today)
            .reduce((total, s) => total + s.duration, 0),
          active_dates: [...dates].sort(),
        };
      }),
    };
  },
};

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

function handleAuth(req, res, url, body) {
  const path = url.pathname.replace('/auth/v1', '');

  if (path === '/signup') {
    const email = String(body?.email ?? '').toLowerCase();
    if ([...db.users.values()].some((user) => user.email === email)) {
      return send(res, 400, { error_code: 'user_already_exists', msg: 'User already registered' });
    }
    const user = {
      id: randomUUID(),
      email,
      password: body?.password ?? '',
      user_metadata: body?.data ?? {},
      created_at: new Date().toISOString(),
    };
    db.users.set(user.id, user);
    // Mirrors the `on_auth_user_created` trigger: every account gets a handle.
    let username = email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'focususer';
    if (username.length < 3) username += 'focus';
    let candidate = username;
    let suffix = 0;
    while (db.profiles.some((profile) => profile.username === candidate)) {
      suffix += 1;
      candidate = `${username}${suffix}`;
    }
    db.profiles.push({
      id: user.id,
      username: candidate,
      display_name: body?.data?.fullName ?? null,
      created_at: user.created_at,
    });
    return send(res, 200, sessionFor(user));
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

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
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
