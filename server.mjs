
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

// PostgreSQL connection with certificate verification.
const ssl = process.env.PGSSL === 'true'
  ? { rejectUnauthorized: true }
  : false;

if (ssl && process.env.PGSSL_CA_FILE) {
  ssl.ca = await readFile(process.env.PGSSL_CA_FILE, 'utf8');
}

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl,
  max: 3,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000
});

pool.on('error', err => {
  console.error('PostgreSQL idle connection error:', err.message);
});

const all = async (sql, params = []) =>
  (await pool.query(sql, params)).rows;

const one = async (sql, params = []) =>
  (await pool.query(sql, params)).rows[0];

const run = (sql, params = []) =>
  pool.query(sql, params);

// Automatically create PostgreSQL tables.
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  age INTEGER,
  goal TEXT NOT NULL DEFAULT 'general',
  level TEXT NOT NULL DEFAULT 'beginner',
  diet_pref TEXT NOT NULL DEFAULT 'balanced',
  created_at TEXT NOT NULL DEFAULT
    (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  body_part TEXT NOT NULL,
  equipment TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  sets TEXT NOT NULL,
  reps TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  safety TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diet_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tag TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES diet_plans(id),
  meal_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE (plan_id, sort_order)
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  performed_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT
    (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (user_id, exercise_id, performed_on)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_user_date
ON workout_logs(user_id, performed_on);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry
ON sessions(expires_at);
`;

try {
  await pool.query('SELECT 1');
  await pool.query(schema);
} catch (err) {
  console.error('PostgreSQL setup failed:', err.message);
  await pool.end();
  process.exit(1);
}

// Existing exercise catalog.
const exerciseSeeds = [
  ['wall-pushup','Wall Push-ups','beginner','Upper body','Wall',5,'2','8–12','💪','Build upper-body strength using a wall.', ['Stand an arm’s length from a wall.','Place palms at shoulder height, slightly wider than shoulders.','Bend elbows while keeping your body straight.','Push away from the wall and repeat.'],'Stop for wrist or shoulder pain.'],
  ['chair-squat','Chair Squats','beginner','Lower body','Chair',8,'2','10–12','🪑','Practice a controlled squat using a sturdy chair.', ['Stand in front of a stable chair with feet hip-width apart.','Move your hips backward and bend your knees.','Gently touch the chair, keeping weight through your feet.','Stand tall without rushing.'],'Use a non-rolling chair; work within a pain-free range.'],
  ['march','March in Place','beginner','Cardio','None',8,'1','5–8 min','🚶','Easy low-impact activity for a gentle warm-up.', ['Stand tall near a stable surface if balance is uncertain.','Lift one knee at a time comfortably.','Move arms naturally while breathing steadily.','Slow down gradually to finish.'],'Reduce pace if dizzy or unusually breathless.'],
  ['bird-dog','Bird Dog','beginner','Core','Mat',6,'2','6 / side','🧘','Improve trunk control and coordination.', ['Start on hands and knees with back in a neutral position.','Extend opposite arm and leg only as far as comfortable.','Hold briefly without arching your back.','Return, then change sides.'],'Pad knees; keep the movement small if needed.'],
  ['incline-pushup','Incline Push-ups','intermediate','Upper body','Stable bench',8,'3','8–12','🏋️','Strengthen chest and arms at an incline.', ['Place hands on a sturdy elevated surface.','Walk feet back until the body forms one straight line.','Lower chest toward hands with elbows controlled.','Press upward, keeping core engaged.'],'Check the support cannot slide or tip.'],
  ['reverse-lunge','Reverse Lunges','intermediate','Lower body','None',9,'3','8 / side','🦵','Develop single-leg strength and balance.', ['Stand upright with feet hip-width apart.','Step one foot backward into a split stance.','Bend both knees comfortably, maintaining control.','Return to standing and alternate legs.'],'Use wall support for balance; avoid painful depth.'],
  ['plank','Forearm Plank','intermediate','Core','Mat',6,'3','20–30 sec','⚡','Build midsection endurance.', ['Set forearms on the floor directly below shoulders.','Extend legs behind, or rest knees on the mat.','Brace gently; avoid letting hips sag.','Breathe continuously during the hold.'],'Stop if shoulders or lower back hurt.'],
  ['stepup','Low Step-ups','intermediate','Cardio','Low step',8,'3','10 / side','🪜','Build leg control with steady repetitions.', ['Face a stable low step.','Step onto it with one foot, keeping knee aligned.','Rise up without jumping.','Step down slowly and switch legs.'],'Choose a low non-slip step; use support if necessary.'],
  ['pushup','Floor Push-ups','advanced','Upper body','Mat',10,'3','10–15','💥','Challenging full-body pressing movement.', ['Place palms on the floor under or slightly wider than shoulders.','Set a straight line from head to heels.','Lower chest smoothly while keeping elbows controlled.','Press back up without bouncing.'],'Modify on knees if form or joints are strained.'],
  ['split-squat','Split Squats','advanced','Lower body','None',10,'3','10 / side','🔥','Train controlled single-leg strength.', ['Take a comfortable staggered stance.','Keep torso upright and lower straight down.','Push through your front foot to rise.','Complete the set, then change sides.'],'Use support for balance; avoid knee pain.'],
  ['side-plank','Side Plank','advanced','Core','Mat',7,'3','25 sec / side','🧱','Develop lateral core strength.', ['Lie on one side with elbow under shoulder.','Lift hips and keep head, torso and legs aligned.','Hold while breathing naturally.','Lower with control and switch sides.'],'Rest lower knee on floor to reduce difficulty.'],
  ['mountain-climber','Slow Mountain Climbers','advanced','Cardio','Mat',9,'3','20 total','⛰️','Controlled cardio and core exercise.', ['Start in a high plank position.','Bring one knee toward the chest without rounding excessively.','Return foot to the starting position.','Alternate steadily while keeping shoulders supported.'],'Choose a slower speed if wrists or back feel strained.']
];

for (const [
  id, name, level, part, equip, dur,
  sets, reps, emoji, desc, steps, safety
] of exerciseSeeds) {
  await run(`
    INSERT INTO exercises
      (id, name, level, body_part, equipment,
       duration_min, sets, reps, emoji,
       description, steps_json, safety)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO NOTHING
  `, [
    id, name, level, part, equip, dur,
    sets, reps, emoji, desc,
    JSON.stringify(steps), safety
  ]);
}

const plans = [
  ['balanced','Balanced Everyday','Simple meals with a variety of food groups.','Flexible'],
  ['vegetarian','Vegetarian Basics','Plant-forward meals with protein-rich choices.','Vegetarian'],
  ['high-protein','Protein Focus','Protein-rich meal ideas without fixed calorie targets.','Protein']
];

for (const plan of plans) {
  await run(`
    INSERT INTO diet_plans (id, name, description, tag)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, plan);
}

const mealSeeds = {
  balanced: [
    ['Breakfast','Oats & fruit','Oats with milk or fortified soy drink, banana, and a handful of nuts.'],
    ['Lunch','Roti, dal & vegetables','Whole-wheat roti, dal, cooked vegetables and curd or a dairy-free alternative.'],
    ['Snack','Fruit & roasted chana','Seasonal fruit and a small portion of roasted chana.'],
    ['Dinner','Rice & mixed plate','Rice, beans or paneer/tofu, sautéed vegetables and a side salad.']
  ],
  vegetarian: [
    ['Breakfast','Besan chilla','Chickpea-flour chilla with vegetables and curd or a dairy-free alternative.'],
    ['Lunch','Rajma rice','Rajma with rice, cucumber salad and seasonal vegetables.'],
    ['Snack','Sprouts or fruit','Cooked sprouts chaat or fruit with nuts.'],
    ['Dinner','Tofu or paneer bowl','Tofu/paneer, whole grains and steamed vegetables.']
  ],
  'high-protein': [
    ['Breakfast','Eggs or tofu scramble','Eggs or tofu with whole-grain toast and fruit.'],
    ['Lunch','Protein lunch bowl','Chicken, tofu or paneer with rice and a colorful vegetable mix.'],
    ['Snack','Yogurt or soy yogurt','Plain high-protein yogurt or soy yogurt with seeds.'],
    ['Dinner','Dal + protein side','Dal, fish/tofu/paneer as preferred, roti and cooked vegetables.']
  ]
};

for (const [planId, items] of Object.entries(mealSeeds)) {
  for (const [index, meal] of items.entries()) {
    await run(`
      INSERT INTO meals
        (plan_id, meal_type, name, description, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (plan_id, sort_order) DO NOTHING
    `, [planId, ...meal, index]);
  }
}

console.log('PostgreSQL connected; tables and initial content ready');

// HTTP response helpers.
function send(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  });
  res.end(body);
}

function error(res, status, message) {
  return send(res, status, { error: message });
}

const secureHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      text += chunk;
      if (text.length > 16000) {
        reject(Object.assign(new Error('Request is too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(text);
        if (!data || Array.isArray(data) || typeof data !== 'object') {
          throw Error();
        }
        resolve(data);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// Password hashing and session authentication.
const hashPassword = pwd => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pwd, salt, 64).toString('hex')}`;
};

function verifyPassword(pwd, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const supplied = scryptSync(pwd, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return supplied.length === expected.length &&
      timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function newSession(uid) {
  const token = randomBytes(32).toString('hex');
  await run(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, $3)
  `, [
    tokenHash(token),
    uid,
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ]);
  return token;
}

async function getUser(id) {
  return one(`
    SELECT id, name, email, age, goal,
           level, diet_pref, created_at
    FROM users
    WHERE id = $1
  `, [id]);
}

async function auth(req) {
  const raw = req.headers.authorization || '';
  if (!raw.startsWith('Bearer ')) return null;

  const token = raw.slice(7);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  const session = await one(`
    SELECT user_id FROM sessions
    WHERE token_hash = $1 AND expires_at > $2
  `, [tokenHash(token), Date.now()]);

  return session ? getUser(session.user_id) : null;
}

const levelValues = ['beginner', 'intermediate', 'advanced'];
const goalValues = ['general', 'strength', 'weight-management'];
const dietValues = ['balanced', 'vegetarian', 'high-protein'];

const attempts = new Map();

function throttle(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  if (attempts.size > 3000) attempts.clear();

  const item = attempts.get(ip);

  if (!item || now - item.since > 600000) {
    attempts.set(ip, { since: now, count: 1 });
    return false;
  }

  item.count++;
  return item.count > 20;
}

function validDate(date) {
  return typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date + 'T00:00:00Z')) &&
    new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}

// Static application files.
const files = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.css': 'app.css',
  '/app.js': 'app.js',
  '/manifest.webmanifest': 'manifest.webmanifest',
  '/service-worker.js': 'service-worker.js',
  '/icons/icon-192.png': 'icons/icon-192.png',
  '/icons/icon-512.png': 'icons/icon-512.png'
};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png'
};

const cache = new Map();

for (const [path, file] of Object.entries(files)) {
  const bytes = await readFile(join(ROOT, 'static', file));
  cache.set(path, {
    bytes,
    type: types[file.slice(file.lastIndexOf('.'))] ||
      'application/octet-stream'
  });
}

// Read catalog from PostgreSQL.
async function listCatalog() {
  const rows = await all(`
    SELECT * FROM exercises
    ORDER BY CASE level
      WHEN 'beginner' THEN 0
      WHEN 'intermediate' THEN 1
      ELSE 2 END, id
  `);

  const exercises = rows.map(({ steps_json, ...rest }) => ({
    ...rest,
    steps: JSON.parse(steps_json)
  }));

  const plans = await all('SELECT * FROM diet_plans');

  for (const plan of plans) {
    plan.meals = await all(`
      SELECT meal_type, name, description
      FROM meals
      WHERE plan_id = $1
      ORDER BY sort_order
    `, [plan.id]);
  }

  return { exercises, plans };
}

// Application API.
const server = http.createServer(async (req, res) => {
  for (const [name, value] of Object.entries(secureHeaders)) {
    res.setHeader(name, value);
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, {
        status: 'ok',
        service: 'fitpath',
        version: '1.0.0'
      });
    }

    if (req.method === 'GET' && path === '/api/catalog') {
      return send(res, 200, await listCatalog());
    }

    if (req.method === 'POST' && path === '/api/register') {
      if (throttle(req)) {
        return error(res, 429, 'Too many attempts. Try again later.');
      }

      const d = await readBody(req);
      const name = typeof d.name === 'string' ? d.name.trim() : '';
      const email = typeof d.email === 'string'
        ? d.email.trim().toLowerCase()
        : '';

      if (name.length < 2 || name.length > 80) {
        return error(res, 400, 'Enter a name (2–80 characters).');
      }

      if (email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error(res, 400, 'Enter a valid email address.');
      }

      if (typeof d.password !== 'string' ||
          d.password.length < 10 || d.password.length > 200) {
        return error(res, 400, 'Password must be at least 10 characters.');
      }

      if (!levelValues.includes(d.level || 'beginner') ||
          !goalValues.includes(d.goal || 'general') ||
          !dietValues.includes(d.diet_pref || 'balanced')) {
        return error(res, 400, 'Invalid profile option.');
      }

      const age = d.age == null || d.age === ''
        ? null
        : Number(d.age);

      if (age != null &&
          (!Number.isInteger(age) || age < 18 || age > 100)) {
        return error(res, 400, 'This version is designed for adults aged 18–100.');
      }

      try {
        const inserted = await one(`
          INSERT INTO users (
            name, email, password_hash, age,
            goal, level, diet_pref
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING id
        `, [
          name, email, hashPassword(d.password), age,
          d.goal || 'general',
          d.level || 'beginner',
          d.diet_pref || 'balanced'
        ]);

        return send(res, 201, {
          token: await newSession(inserted.id),
          user: await getUser(inserted.id)
        });

      } catch (err) {
        if (err.code === '23505') {
          return error(res, 409, 'An account with this email already exists.');
        }
        throw err;
      }
    }

    if (req.method === 'POST' && path === '/api/login') {
      if (throttle(req)) {
        return error(res, 429, 'Too many attempts. Try again later.');
      }

      const d = await readBody(req);
      const email = typeof d.email === 'string'
        ? d.email.trim().toLowerCase()
        : '';

      if (typeof d.password !== 'string' ||
          d.password.length > 200) {
        return error(res, 401, 'Invalid email or password.');
      }

      const user = await one(`
        SELECT id, password_hash
        FROM users
        WHERE email = $1
      `, [email]);

      if (!user || !verifyPassword(d.password, user.password_hash)) {
        return error(res, 401, 'Invalid email or password.');
      }

      return send(res, 200, {
        token: await newSession(user.id),
        user: await getUser(user.id)
      });
    }

    if (path.startsWith('/api/')) {
      const user = await auth(req);

      if (!user) {
        return error(res, 401, 'Please sign in again.');
      }

      if (req.method === 'GET' && path === '/api/me') {
        return send(res, 200, { user });
      }

      if (req.method === 'PATCH' && path === '/api/me') {
        const d = await readBody(req);

        const name = d.name === undefined
          ? user.name
          : String(d.name).trim();

        const level = d.level === undefined
          ? user.level
          : d.level;

        const goal = d.goal === undefined
          ? user.goal
          : d.goal;

        const diet = d.diet_pref === undefined
          ? user.diet_pref
          : d.diet_pref;

        const age = d.age === undefined
          ? user.age
          : (d.age === '' || d.age === null ? null : Number(d.age));

        if (
          name.length < 2 || name.length > 80 ||
          !levelValues.includes(level) ||
          !goalValues.includes(goal) ||
          !dietValues.includes(diet) ||
          (age !== null &&
            (!Number.isInteger(age) || age < 18 || age > 100))
        ) {
          return error(res, 400, 'Check your profile details.');
        }

        await run(`
          UPDATE users
          SET name = $1, age = $2, level = $3,
              goal = $4, diet_pref = $5
          WHERE id = $6
        `, [name, age, level, goal, diet, user.id]);

        return send(res, 200, {
          user: await getUser(user.id)
        });
      }

      if (req.method === 'GET' && path === '/api/logs') {
        const date = url.searchParams.get('date');

        if (date && !validDate(date)) {
          return error(res, 400, 'Invalid date.');
        }

        const logs = date
          ? await all(`
              SELECT id, exercise_id, performed_on, created_at
              FROM workout_logs
              WHERE user_id = $1 AND performed_on = $2
              ORDER BY id DESC
            `, [user.id, date])
          : await all(`
              SELECT id, exercise_id, performed_on, created_at
              FROM workout_logs
              WHERE user_id = $1
              ORDER BY performed_on DESC, id DESC
              LIMIT 100
            `, [user.id]);

        return send(res, 200, { logs });
      }

      if (req.method === 'POST' && path === '/api/logs') {
        const d = await readBody(req);
        const date = d.date ||
          new Date().toISOString().slice(0, 10);

        const exercise = typeof d.exerciseId === 'string'
          ? await one(
              'SELECT id FROM exercises WHERE id = $1',
              [d.exerciseId]
            )
          : null;

        if (!validDate(date) || !exercise) {
          return error(res, 400, 'Invalid exercise or date.');
        }

        await run(`
          INSERT INTO workout_logs (
            user_id, exercise_id, performed_on
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, exercise_id, performed_on)
          DO NOTHING
        `, [user.id, d.exerciseId, date]);

        const logs = await all(`
          SELECT id, exercise_id, performed_on
          FROM workout_logs
          WHERE user_id = $1 AND performed_on = $2
        `, [user.id, date]);

        return send(res, 200, {
          success: true,
          logs
        });
      }

      if (req.method === 'DELETE' &&
          path.startsWith('/api/logs/')) {
        const exerciseId = decodeURIComponent(
          path.slice('/api/logs/'.length)
        );

        const date = url.searchParams.get('date');

        if (!validDate(date)) {
          return error(res, 400, 'Invalid date.');
        }

        await run(`
          DELETE FROM workout_logs
          WHERE user_id = $1
            AND exercise_id = $2
            AND performed_on = $3
        `, [user.id, exerciseId, date]);

        return send(res, 200, { success: true });
      }

      if (req.method === 'POST' && path === '/api/logout') {
        const token =
          req.headers.authorization?.slice(7) || '';

        await run(
          'DELETE FROM sessions WHERE token_hash = $1',
          [tokenHash(token)]
        );

        return send(res, 200, { success: true });
      }

      return error(res, 404, 'API route not found.');
    }

    if (req.method === 'GET' && cache.has(path)) {
      const { bytes, type } = cache.get(path);

      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': path === '/service-worker.js'
          ? 'no-cache'
          : 'public, max-age=300'
      });

      return res.end(bytes);
    }

    return error(res, 404, 'Not found.');

  } catch (err) {
    if (!res.headersSent) {
      if (err.status) {
        error(res, err.status, err.message);
      } else {
        console.error('Request failure:', err);
        error(res, 500, 'Internal server error.');
      }
    }
  }
});

server.requestTimeout = 20000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `FitPath listening on http://0.0.0.0:${PORT}`
  );
});

// Clean expired sessions twice daily.
const cleanup = setInterval(() => {
  run(
    'DELETE FROM sessions WHERE expires_at < $1',
    [Date.now()]
  ).catch(err =>
    console.error('Session cleanup error:', err.message)
  );
}, 12 * 60 * 60 * 1000);

cleanup.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      clearInterval(cleanup);
      await pool.end();
      process.exit(0);
    });
  });
}
