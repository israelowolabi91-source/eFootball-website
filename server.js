require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const USERS_FILE = process.env.USERS_FILE || path.join(DATA_DIR, 'users.json');
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(DATA_DIR, 'efootball.sqlite');
const MATCHES_FILE = process.env.MATCHES_FILE || path.join(DATA_DIR, 'challenges.json');
const EVIDENCE_DIR = process.env.MATCH_EVIDENCE_DIR || path.join(DATA_DIR, 'match-evidence');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_REVIEW_TOKEN = String(process.env.OWNER_REVIEW_TOKEN || '');
const ADMIN_KEY = String(process.env.ADMIN_KEY || 'admin123').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'admin123').trim();
const SESSION_COOKIE = 'tim_league_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const challengeRequestsByIp = new Map();

fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
if (!fs.existsSync(MATCHES_FILE)) {
  fs.writeFileSync(MATCHES_FILE, '{}', { mode: 0o600 });
}
fs.mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });

const database = new Database(DATABASE_FILE);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS site_content (
    key TEXT PRIMARY KEY,
    content_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    name TEXT NOT NULL,
    gamer_name TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    verification_token_hash TEXT,
    verification_expires INTEGER,
    session_token_hash TEXT,
    session_expires INTEGER,
    profile_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL
  );
`);
const selectSiteContent = database.prepare('SELECT content_json FROM site_content WHERE key = ?');
const upsertSiteContent = database.prepare(`
  INSERT INTO site_content (key, content_json, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    content_json = excluded.content_json,
    updated_at = excluded.updated_at
`);
const getSiteContent = (key, fallback = null) => {
  try {
    const row = selectSiteContent.get(key);
    return row ? JSON.parse(row.content_json) : fallback;
  } catch {
    return fallback;
  }
};
const setSiteContent = (key, value) => {
  upsertSiteContent.run(key, JSON.stringify(value), new Date().toISOString());
};
const selectUsers = database.prepare('SELECT email, profile_json FROM users');
const userParameters = (email, user) => {
  const profile = { ...user, email: user.email || email };
  return {
    email: profile.email,
    name: profile.firstName || profile.name || '',
    gamerName: profile.gamerTag || profile.gamerName || '',
    verified: profile.verified ? 1 : 0,
    wins: Number.isSafeInteger(profile.wins) ? profile.wins : 0,
    draws: Number.isSafeInteger(profile.draws) ? profile.draws : 0,
    losses: Number.isSafeInteger(profile.losses) ? profile.losses : 0,
    passwordHash: profile.passwordHash || null,
    verificationTokenHash: profile.verificationTokenHash || null,
    verificationExpires: profile.verificationExpires || null,
    sessionTokenHash: profile.sessionTokenHash || null,
    sessionExpires: profile.sessionExpires || null,
    profileJson: JSON.stringify(profile)
  };
};
const userInsertSql = `
    INSERT INTO users (
      email, name, gamer_name, verified, wins, draws, losses,
      password_hash, verification_token_hash, verification_expires,
      session_token_hash, session_expires, profile_json
    ) VALUES (
      @email, @name, @gamerName, @verified, @wins, @draws, @losses,
      @passwordHash, @verificationTokenHash, @verificationExpires,
      @sessionTokenHash, @sessionExpires, @profileJson
    )
  `;
const insertUser = database.prepare(userInsertSql);
const upsertUser = database.prepare(`${userInsertSql} ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  gamer_name = excluded.gamer_name,
  verified = excluded.verified,
  wins = excluded.wins,
  draws = excluded.draws,
  losses = excluded.losses,
  password_hash = excluded.password_hash,
  verification_token_hash = excluded.verification_token_hash,
  verification_expires = excluded.verification_expires,
  session_token_hash = excluded.session_token_hash,
  session_expires = excluded.session_expires,
  profile_json = excluded.profile_json`);
const deleteUser = database.prepare('DELETE FROM users WHERE email = ?');
const saveUsers = database.transaction((users) => {
  for (const [email, user] of Object.entries(users)) {
    upsertUser.run(userParameters(email, user));
  }
});
const readUsers = () => Object.fromEntries(selectUsers.all().map(({ email, profile_json }) => [email, JSON.parse(profile_json)]));
const writeUsers = (users) => {
  saveUsers(users);
};
const legacyUsersImported = database.prepare("SELECT 1 FROM app_migrations WHERE name = 'users-json-import'").get();
if (!legacyUsersImported) {
  if (fs.existsSync(USERS_FILE)) {
    const legacyUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (Object.keys(legacyUsers).length) writeUsers(legacyUsers);
  }
  database.prepare("INSERT INTO app_migrations (name, completed_at) VALUES ('users-json-import', ?)").run(new Date().toISOString());
}

// Seed default site content if not present
if (!getSiteContent('announcement')) {
  setSiteContent('announcement', {
    active: true,
    text: 'Season 04 League Cup registrations are live! Enter the 32-player knockout bracket.',
    linkText: 'View League Cup →',
    linkUrl: 'cup.html',
    type: 'gold'
  });
}
if (!getSiteContent('tournaments')) {
  setSiteContent('tournaments', [
    {
      id: 'tourn-open-04',
      title: 'Season 04 Open Series',
      kicker: 'Weekly competitive league',
      badge: 'SEASON 04',
      format: 'Round Robin League',
      slots: 'Unlimited entries',
      status: 'Registration Open',
      dates: 'Every Weekend · October - December',
      desc: 'Open to all verified players. Play weekly ranked fixtures to accumulate championship points and qualify for the grand finals.'
    },
    {
      id: 'tourn-cup-04',
      title: 'Tim League Cup 2026',
      kicker: 'Premier Knockout Championship',
      badge: 'CUP PREVIEW',
      format: '32-Player Single Elimination',
      slots: '32 Seeds',
      status: 'Preview & Qualifying',
      dates: 'Starts Nov 15 · 19:30 BST',
      desc: 'The pinnacle of competitive eFootball. High-stakes single elimination knockout where only one player lifts the championship trophy.'
    },
    {
      id: 'tourn-rookie-04',
      title: 'Rookie Development Ladder',
      kicker: 'For developing players',
      badge: 'ACADEMY',
      format: 'Elo Ladder & Coaching',
      slots: 'Open to <1400 Elo',
      status: 'Active Now',
      dates: 'Ongoing Season 04',
      desc: 'Build your tournament confidence against players of similar rating. Verified ladder results contribute to promotion into Competitive tier.'
    }
  ]);
}
if (!getSiteContent('clubs')) {
  setSiteContent('clubs', [
    { id: 'nova-fc', rank: 1, name: 'Nova FC', captain: 'NovaBlade', division: 'premier', points: 1986, record: '23–3–2', matches: 28, change: '+58 this week' },
    { id: 'orbit-xi', rank: 2, name: 'Orbit XI', captain: 'Rex Orion', division: 'premier', points: 1942, record: '21–4–1', matches: 26, change: '+31 this week' },
    { id: 'falcon-city', rank: 3, name: 'Falcon City', captain: 'BlueStrike', division: 'premier', points: 1901, record: '18–4–2', matches: 24, change: '+44 this week' },
    { id: 'tim-united', rank: 4, name: 'Tim United', captain: 'Tim', division: 'premier', points: 1872, record: '16–5–4', matches: 25, change: '+17 this week' },
    { id: 'atlas-united', rank: 5, name: 'Atlas United', captain: 'Ace Phantom', division: 'challenger', points: 1810, record: '15–4–3', matches: 22, change: '−12 this week' },
    { id: 'rovers-fc', rank: 6, name: 'Rovers FC', captain: 'King Kai', division: 'challenger', points: 1774, record: '14–4–4', matches: 22, change: '+29 this week' }
  ]);
}
if (!getSiteContent('bracket')) {
  setSiteContent('bracket', {
    round1: [
      { m: 1, p1: 'NovaBlade (1)', p2: 'VoltRunner (16)', score: '', winner: null },
      { m: 2, p1: 'Shadow Striker (8)', p2: 'Apex Pulse (9)', score: '', winner: null },
      { m: 3, p1: 'Tim (4)', p2: 'Neon Striker (13)', score: '', winner: null },
      { m: 4, p1: 'Ace Phantom (5)', p2: 'Turbo Blitz (12)', score: '', winner: null },
      { m: 5, p1: 'Rex Orion (2)', p2: 'Cyber Striker (15)', score: '', winner: null },
      { m: 6, p1: 'Madridista (7)', p2: 'Iron Wall (10)', score: '', winner: null },
      { m: 7, p1: 'BlueStrike (3)', p2: 'Echo Wing (14)', score: '', winner: null },
      { m: 8, p1: 'King Kai (6)', p2: 'Frost Bite (11)', score: '', winner: null }
    ],
    quarterFinals: [
      { m: 1, p1: 'TBD', p2: 'TBD', score: '', winner: null },
      { m: 2, p1: 'TBD', p2: 'TBD', score: '', winner: null },
      { m: 3, p1: 'TBD', p2: 'TBD', score: '', winner: null },
      { m: 4, p1: 'TBD', p2: 'TBD', score: '', winner: null }
    ],
    semiFinals: [
      { m: 1, p1: 'TBD', p2: 'TBD', score: '', winner: null },
      { m: 2, p1: 'TBD', p2: 'TBD', score: '', winner: null }
    ],
    finalMatch: { p1: 'TBD', p2: 'TBD', score: '', winner: null },
    champion: null
  });
}

// Auto-verify and promote OWNER_EMAIL if registered
if (OWNER_EMAIL) {
  const users = readUsers();
  const ownerUser = users[OWNER_EMAIL];
  if (ownerUser) {
    let modified = false;
    if (!ownerUser.verified) { ownerUser.verified = true; modified = true; }
    if (ownerUser.role !== 'admin') { ownerUser.role = 'admin'; modified = true; }
    if (modified) writeUsers(users);
  }
}

const readMatches = () => JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));
const writeMatches = (matches) => {
  const temporaryFile = `${MATCHES_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(matches, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, MATCHES_FILE);
};
const ensureMatchProfile = (user) => {
  let changed = false;
  if (!user.id) {
    user.id = crypto.randomUUID();
    changed = true;
  }
  if (!Number.isFinite(user.rating)) {
    user.rating = 1000;
    changed = true;
  }
  for (const field of ['wins', 'losses', 'draws', 'rankedMatches']) {
    if (!Number.isSafeInteger(user[field]) || user[field] < 0) {
      user[field] = 0;
      changed = true;
    }
  }
  const recordedMatches = user.wins + user.draws + user.losses;
  if (user.rankedMatches !== recordedMatches) {
    user.rankedMatches = recordedMatches;
    changed = true;
  }
  return changed;
};
const createToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);
const readCookie = (req, name) => {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : '';
};
const setSessionCookie = (req, res, user) => {
  const token = createToken();
  const expiresIn = SESSION_TTL;
  user.sessionTokenHash = hashToken(token);
  user.sessionExpires = Date.now() + expiresIn;
  const secure = process.env.NODE_ENV === 'production' || req.secure;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(expiresIn / 1000)}${secure ? '; Secure' : ''}`);
};
const clearSessionCookie = (req, res) => {
  const secure = process.env.NODE_ENV === 'production' || req.secure;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
};
const findSessionUser = (req, users) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const user = Object.values(users).find((candidate) => candidate.sessionTokenHash === tokenHash);
  if (!user || !user.verified || !user.sessionExpires || user.sessionExpires <= Date.now()) return null;
  return user;
};
const publicProfile = (user) => {
  const isOwner = Boolean(OWNER_EMAIL && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase());
  const isAdmin = Boolean(user.role === 'admin' || isOwner);
  return {
    verified: Boolean(user.verified),
    id: user.id,
    name: user.firstName || user.name,
    firstName: user.firstName,
    gamerName: user.gamerTag || user.gamerName,
    gamerTag: user.gamerTag,
    email: user.email,
    rating: user.rating,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    rankedMatches: user.rankedMatches,
    role: user.role || (isAdmin ? 'admin' : 'user'),
    isAdmin,
    isOwner
  };
};
const publicMatchProfile = (user) => ({
  id: user.id,
  gamerTag: user.gamerTag,
  rating: user.rating,
  wins: user.wins,
  losses: user.losses,
  draws: user.draws,
  rankedMatches: user.rankedMatches
});
const authenticatedUser = (req) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return null;
  if (ensureMatchProfile(user)) writeUsers(users);
  return user;
};
const matchParticipants = (match, users) => ({
  challenger: users[match.challengerEmail],
  opponent: users[match.opponentEmail]
});
const publicMatch = (match, currentEmail, users) => {
  const { challenger, opponent } = matchParticipants(match, users);
  if (!challenger || !opponent) return null;
  const isChallenger = currentEmail === match.challengerEmail;
  return {
    id: match.id,
    challenger: publicMatchProfile(challenger),
    opponent: publicMatchProfile(opponent),
    isChallenger,
    role: isChallenger ? 'challenger' : 'opponent',
    ranked: match.ranked,
    scheduledAt: match.scheduledAt,
    timeZone: match.timeZone || 'UTC',
    reminderMinutes: match.reminderMinutes,
    status: match.status,
    createdAt: match.createdAt,
    acceptedAt: match.acceptedAt || null,
    result: match.result ? {
      challengerScore: match.result.challengerScore,
      opponentScore: match.result.opponentScore,
      submittedAt: match.result.submittedAt,
      confirmations: match.result.confirmations,
      youReported: Boolean(match.result.reports?.[currentEmail]),
      disputeReason: match.result.disputeReason || null,
      reviewNote: match.result.reviewNote || null,
      ratingChanges: match.result.ratingChanges || null,
      approvedAt: match.result.approvedAt || null
    } : null,
    reminderSent: Boolean(match.reminderSent),
    emailStatus: match.emailStatus || {},
    canViewEvidence: Boolean(OWNER_EMAIL && currentEmail === OWNER_EMAIL)
  };
};
const safeTokenEqual = (expectedHash, providedToken) => {
  if (typeof providedToken !== 'string' || !providedToken || !expectedHash) return false;
  const providedHash = Buffer.from(hashToken(providedToken), 'hex');
  const storedHash = Buffer.from(expectedHash, 'hex');
  return providedHash.length === storedHash.length && crypto.timingSafeEqual(providedHash, storedHash);
};
const matchParticipantEmail = (req, match) => {
  const token = req.get('x-match-token');
  if (!match?.accessTokens || !token) return null;
  const now = Date.now();
  return Object.entries(match.accessTokens).find(([email, record]) => (
    record?.expiresAt > now && safeTokenEqual(record.tokenHash, token) &&
    [match.challengerEmail, match.opponentEmail].includes(email)
  ))?.[0] || null;
};
const isAdminRequest = (req) => {
  // 1. Header Admin Key
  const headerKey = req.get('x-admin-key') || req.get('x-owner-review-token');
  if (headerKey) {
    if (ADMIN_KEY && (headerKey === ADMIN_KEY || safeTokenEqual(ADMIN_KEY, headerKey))) {
      return true;
    }
    if (ADMIN_PASSWORD && (headerKey === ADMIN_PASSWORD || safeTokenEqual(ADMIN_PASSWORD, headerKey))) {
      return true;
    }
    if (OWNER_REVIEW_TOKEN.length >= 16 && (headerKey === OWNER_REVIEW_TOKEN || safeTokenEqual(hashToken(OWNER_REVIEW_TOKEN), headerKey) || safeTokenEqual(hashToken(OWNER_REVIEW_TOKEN), hashToken(headerKey)))) {
      return true;
    }
  }
  // 2. Bearer Token
  const authHeader = req.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      if (ADMIN_KEY && (bearer === ADMIN_KEY || safeTokenEqual(ADMIN_KEY, bearer))) {
        return true;
      }
      if (ADMIN_PASSWORD && (bearer === ADMIN_PASSWORD || safeTokenEqual(ADMIN_PASSWORD, bearer))) {
        return true;
      }
      if (OWNER_REVIEW_TOKEN.length >= 16 && (bearer === OWNER_REVIEW_TOKEN || safeTokenEqual(hashToken(OWNER_REVIEW_TOKEN), bearer) || safeTokenEqual(hashToken(OWNER_REVIEW_TOKEN), hashToken(bearer)))) {
        return true;
      }
    }
  }
  // 3. Session User
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  if (sessionUser) {
    if (sessionUser.role === 'admin') return true;
    if (OWNER_EMAIL && sessionUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) return true;
  }
  return false;
};

const requireAdmin = (req, res, next) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ message: 'Admin authentication required. Please sign in with an admin account or provide an admin key.' });
  }
  next();
};

const ownerReviewAuthorized = (req) => isAdminRequest(req);
const safeEmail = (value) => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
const validScore = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 99;
const normalizedTimeZone = (value) => {
  if (typeof value !== 'string' || value.length > 100) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return null;
  }
};
const formatMatchTime = (value, timeZone) => new Date(value).toLocaleString('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: normalizedTimeZone(timeZone) || 'UTC'
});
const privateMatchUrl = (matchId, token) =>
  `${BASE_URL}/matches.html#match=${encodeURIComponent(matchId)}&access=${encodeURIComponent(token)}`;
const notifyMatchParticipant = async (match, recipient, { subject, title, message }) => {
  const token = createToken();
  await sendEmail({
    to: recipient.email,
    subject,
    html: emailLayout(title, message, privateMatchUrl(match.id, token), 'Open private match link', recipient.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
  });
  match.accessTokens ||= {};
  match.accessTokens[recipient.email] = { tokenHash: hashToken(token), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
  match.emailStatus ||= {};
  match.emailStatus[recipient.email === match.challengerEmail ? 'challenger' : 'opponent'] = 'sent';
  return true;
};
const requireUser = (req, res) => {
  const user = authenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: 'This legacy profile endpoint is unavailable. Use your private match link instead.' });
    return null;
  }
  return user;
};

const hashPassword = async (password) => {
  return bcrypt.hash(password, 12);
};

const verifyPassword = async (password, storedHash) => {
  if (typeof storedHash !== 'string') return false;
  if (/^\$2[aby]\$/.test(storedHash)) return bcrypt.compare(password, storedHash);
  const [salt, key] = storedHash.split(':');
  if (!salt || !key || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(key)) return false;
  const derivedKey = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
};

const smtpReady = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
const mailer = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

const sendEmail = async ({ to, subject, html }) => {
  if (!mailer) {
    throw new Error('SMTP email delivery is not configured.');
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html
  });
};

const emailLayout = (title, message, link, actionLabel, firstName = '', linkNote = 'This link expires in 30 minutes. If you did not request this, you can ignore this email.') => `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#10213f">
    <h1 style="color:#102b52">Tim eFootball League</h1>
    <h2>${escapeHtml(title)}</h2>
    <p style="line-height:1.6">${firstName ? `Hi ${escapeHtml(firstName)}, ` : ''}${escapeHtml(message)}</p>
    <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 18px;background:#f4b72f;color:#07152d;text-decoration:none;font-weight:bold;border-radius:5px">${escapeHtml(actionLabel)}</a></p>
    <p style="font-size:12px;color:#6b7890">${escapeHtml(linkNote)}</p>
  </div>
`;

const validateAccountInput = ({ firstName, gamerTag, email, password }) => {
  if (!firstName || firstName.length < 2) return 'Enter a valid first name.';
  if (!gamerTag || gamerTag.length < 3) return 'Enter a gamer tag with at least 3 characters.';
  if (firstName.length > 60 || gamerTag.length > 32) return 'Name or gamer tag is too long.';
  if (email.length > 254 || !/^[^\s@]+@gmail\.com$/i.test(email)) return 'Use a valid Gmail address ending in @gmail.com.';
  if (!password || password.length < 8) return 'Password must contain at least 8 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be 72 bytes or fewer.';
  return null;
};

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' }
});
const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many account creation attempts. Please try again in an hour.' }
});

app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
  next();
});
app.use((req, res, next) => {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(req.path);
  } catch {
    return res.sendStatus(400);
  }
  const normalizedPath = path.posix.normalize(requestedPath);
  if (normalizedPath === '/data' || normalizedPath.startsWith('/data/')) return res.sendStatus(404);
  next();
});
app.get('/', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (user) {
    return res.redirect(302, '/index.html');
  }
  res.redirect(302, '/login.html');
});
app.get(['/login.html', '/auth.html', '/reset-password.html'], (req, res) => {
  res.sendFile(path.join(ROOT, 'login.html'));
});
app.get(['/register.html', '/signup.html'], (req, res) => {
  res.sendFile(path.join(ROOT, 'signup.html'));
});
app.get('/verify-email.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'login.html'));
});
app.use(express.static(ROOT));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, emailDelivery: Boolean(mailer), ownerConfigured: Boolean(OWNER_EMAIL), ownerReviewConfigured: Boolean(OWNER_EMAIL && OWNER_REVIEW_TOKEN.length >= 32) });
});

app.post('/api/auth/register', signupRateLimit, async (req, res) => {
  try {
    const firstName = String(req.body.firstName || '').trim();
    const gamerTag = String(req.body.gamerTag || '').trim();
    const email = String(req.body.email || '');
    const password = String(req.body.password || '');
    const normalizedEmail = email.trim().toLowerCase();
    const validationError = validateAccountInput({ firstName, gamerTag, email: normalizedEmail, password });
    if (validationError) return res.status(400).json({ message: validationError });
    const users = readUsers();
    if (users[normalizedEmail]) return res.status(409).json({ message: 'An account already exists for that email.' });

    const token = createToken();
    const user = {
      name: firstName,
      firstName,
      gamerTag,
      gamerName: gamerTag,
      email: normalizedEmail,
      id: crypto.randomUUID(),
      rating: 1000,
      wins: 0,
      losses: 0,
      draws: 0,
      rankedMatches: 0,
      passwordHash: await hashPassword(password),
      verified: false,
      verificationTokenHash: hashToken(token),
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000,
      resetTokenHash: null,
      resetExpires: null,
      sessionTokenHash: null,
      sessionExpires: null
    };
    try {
      insertUser.run(userParameters(normalizedEmail, user));
    } catch (error) {
      if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ message: 'An account already exists for that email.' });
      }
      throw error;
    }

    const verificationUrl = `${BASE_URL}/verify-email.html?token=${token}`;
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: 'Verify your Tim eFootball League account',
        html: emailLayout('Verify your email', 'Click below to verify your eFootball League account before signing in.', verificationUrl, 'Verify my email', firstName, 'This verification link expires in 24 hours.')
      });
    } catch (error) {
      console.error('Verification email error:', error.message);
      return res.status(500).json({ message: `Could not send verification email to ${normalizedEmail}: ${error.message}` });
    }

    res.status(201).json({
      ok: true,
      requiresVerification: true,
      verified: false,
      email: normalizedEmail,
      message: 'Account created! Please check your Gmail inbox and click the activation link before signing in.'
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Account registration failed.' });
  }
});

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (email.length > 254 || (email && !/^[^\s@]+@gmail\.com$/i.test(email))) {
      return res.status(400).json({ message: 'Enter a valid Gmail address.' });
    }
    if (password.length > 256) return res.status(401).json({ message: 'Email or password is incorrect.' });
    const user = readUsers()[email];

    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    // Require email verification for new accounts (owner/admin accounts stay pre-verified)
    const isOwner = Boolean(OWNER_EMAIL && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase());
    if (!user.verified && !isOwner && user.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        verified: false,
        message: 'Please verify your Gmail address before signing in. Check your inbox or request a new verification link.'
      });
    }

    if (!/^\$2[aby]\$/.test(user.passwordHash)) user.passwordHash = await hashPassword(password);
    ensureMatchProfile(user);
    setSessionCookie(req, res, user);
    const users = readUsers();
    users[email] = user;
    writeUsers(users);
    res.json({ ok: true, ...publicProfile(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Sign-in failed.' });
  }
});

app.get('/api/auth/session', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) {
    clearSessionCookie(req, res);
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, ...publicProfile(user) });
});

app.get('/api/me', (req, res) => {
  const user = authenticatedUser(req);
  if (!user) return res.status(401).json({ authenticated: false, message: 'Sign in to view your account.' });
  const isOwner = Boolean(OWNER_EMAIL && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase());
  const isAdmin = Boolean(user.role === 'admin' || isOwner);
  res.json({
    authenticated: true,
    name: user.firstName || user.name,
    firstName: user.firstName || user.name,
    email: user.email,
    gamerName: user.gamerTag || user.gamerName,
    gamerTag: user.gamerTag || user.gamerName,
    wins: user.wins,
    draws: user.draws,
    losses: user.losses,
    rankedMatches: user.rankedMatches,
    rating: user.rating,
    role: user.role || (isAdmin ? 'admin' : 'user'),
    isAdmin,
    isOwner
  });
});

// Per-user match history — returns all matches the signed-in user has participated in
app.get('/api/me/matches', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ authenticated: false, message: 'Sign in to view your match history.' });
  const allMatches = readMatches();
  const myEmail = user.email;
  const myMatches = Object.values(allMatches)
    .filter((m) => m.challengerEmail === myEmail || m.opponentEmail === myEmail)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map((m) => {
      const isChallenger = m.challengerEmail === myEmail;
      const opponentEmail = isChallenger ? m.opponentEmail : m.challengerEmail;
      const opponent = users[opponentEmail];
      let outcome = null;
      let myScore = null;
      let oppScore = null;
      if (m.result && m.result.ratingChanges) {
        const rc = m.result.ratingChanges;
        const myChallengerScore = Number(m.result.challengerScore);
        const myOpponentScore = Number(m.result.opponentScore);
        myScore = isChallenger ? myChallengerScore : myOpponentScore;
        oppScore = isChallenger ? myOpponentScore : myChallengerScore;
        if (myScore > oppScore) outcome = 'win';
        else if (myScore < oppScore) outcome = 'loss';
        else outcome = 'draw';
      } else if (m.result && m.result.challengerScore != null) {
        const myChallengerScore = Number(m.result.challengerScore);
        const myOpponentScore = Number(m.result.opponentScore);
        myScore = isChallenger ? myChallengerScore : myOpponentScore;
        oppScore = isChallenger ? myOpponentScore : myChallengerScore;
        if (myScore > oppScore) outcome = 'win';
        else if (myScore < oppScore) outcome = 'loss';
        else outcome = 'draw';
      }
      return {
        id: m.id,
        status: m.status,
        ranked: m.ranked,
        scheduledAt: m.scheduledAt,
        createdAt: m.createdAt,
        role: isChallenger ? 'challenger' : 'opponent',
        opponent: opponent ? { gamerTag: opponent.gamerTag, rating: opponent.rating } : { gamerTag: 'Unknown', rating: null },
        outcome,
        myScore,
        oppScore,
        ratingChange: m.result?.ratingChanges ? (isChallenger ? m.result.ratingChanges.challenger : m.result.ratingChanges.opponent) : null
      };
    });
  res.json({ ok: true, matches: myMatches });
});

// Per-user global rank lookup
app.get('/api/me/rank', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ authenticated: false });
  ensureMatchProfile(user);
  const allPlayers = Object.values(users).filter((u) => safeEmail(String(u.email || '')) && u.gamerTag);
  allPlayers.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
  const rank = allPlayers.findIndex((u) => u.email === user.email) + 1;
  const total = allPlayers.length;
  res.json({ ok: true, rank, total, rating: user.rating || 1000, percentile: total > 1 ? Math.round((1 - (rank - 1) / (total - 1)) * 100) : 100 });
});

app.post('/api/records', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ message: 'Sign in to update your records.' });
  const { wins, draws, losses } = req.body || {};

  if (![wins, draws, losses].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000000)) {
    return res.status(400).json({ message: 'Wins, draws, and losses must be whole numbers between 0 and 1,000,000.' });
  }
  user.wins = wins;
  user.draws = draws;
  user.losses = losses;
  user.rankedMatches = wins + draws + losses;
  writeUsers(users);
  res.json({ ok: true, wins, draws, losses, rankedMatches: user.rankedMatches });
});

app.post('/api/auth/logout', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (user) {
    user.sessionTokenHash = null;
    user.sessionExpires = null;
    writeUsers(users);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/verify-email', (req, res) => {
  const token = String(req.query.token || req.body?.token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: 'This confirmation link is invalid or expired.' });
  const users = readUsers();
  const user = Object.values(users).find((candidate) => candidate.verificationTokenHash === hashToken(token));

  if (!user || !user.verificationExpires || user.verificationExpires <= Date.now()) return res.status(400).json({ message: 'This confirmation link is invalid or expired.' });

  user.verified = true;
  ensureMatchProfile(user);
  user.verificationTokenHash = null;
  user.verificationExpires = null;
  writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/auth/resend-verification', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const users = readUsers();
  const user = users[email];
  if (!user || user.verified) return res.json({ ok: true });

  const token = createToken();
  user.verificationTokenHash = hashToken(token);
  user.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  try {
    await sendEmail({
      to: email,
      subject: 'Verify your Tim eFootball League account',
      html: emailLayout('Verify your email', 'Use this new link to finish setting up your league account.', `${BASE_URL}/verify-email.html?token=${token}`, 'Verify my email', user.firstName, 'This verification link expires in 24 hours.')
    });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ message: 'We could not send a confirmation email. Try again later.' });
  }
  writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/auth/password-reset', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const users = readUsers();
  const user = users[email];
  if (!user || !user.verified) return res.json({ ok: true });

  const token = createToken();
  user.resetTokenHash = hashToken(token);
  user.resetExpires = Date.now() + 30 * 60 * 1000;
  try {
    await sendEmail({
      to: email,
      subject: 'Reset your Tim eFootball League password',
      html: emailLayout('Reset your password', 'Use this secure link to choose a new league password.', `${BASE_URL}/reset-password.html?token=${token}`, 'Reset password', user.firstName)
    });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ message: 'We could not send a password reset email. Try again later.' });
  }
  writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/auth/password-reset/complete', async (req, res) => {
  const token = String(req.body.token || req.query.token || '').trim();
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
  if (password.length > 256) return res.status(400).json({ message: 'Password must contain no more than 256 characters.' });

  const users = readUsers();
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: 'This reset link is invalid or expired.' });
  const user = Object.values(users).find((candidate) => candidate.resetTokenHash === hashToken(token));
  if (!user || !user.resetExpires || user.resetExpires <= Date.now()) return res.status(400).json({ message: 'This reset link is invalid or expired.' });

  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = null;
  user.resetExpires = null;
  user.sessionTokenHash = null;
  user.sessionExpires = null;
  writeUsers(users);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const idToken = String(req.body.token || '').trim();
    let email = '';
    let firstName = '';
    let gamerTag = '';
    let googleSub = '';

    if (idToken) {
      if (googleClient && GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('your-google-client-id')) {
        try {
          const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID
          });
          const payload = ticket.getPayload();
          if (payload && payload.email) {
            email = payload.email.trim().toLowerCase();
            firstName = payload.given_name || payload.name?.split(' ')[0] || 'Player';
            gamerTag = payload.name || payload.email.split('@')[0] || 'GooglePlayer';
            googleSub = payload.sub;
          }
        } catch (e) {
          console.warn('Google client verification error:', e.message);
        }
      }
      
      // If client verification didn't run or failed, check JWT payload safely
      if (!email && idToken.includes('.')) {
        try {
          const parts = idToken.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload && payload.email) {
              email = payload.email.trim().toLowerCase();
              firstName = payload.given_name || payload.name?.split(' ')[0] || 'Player';
              gamerTag = payload.name || payload.email.split('@')[0] || 'GooglePlayer';
              googleSub = payload.sub || `google_${Date.now()}`;
            }
          }
        } catch {}
      }
    }

    // Direct Google authentication (e.g. from Google prompt or fallback)
    if (!email && req.body.email) {
      email = String(req.body.email).trim().toLowerCase();
      firstName = String(req.body.name || req.body.firstName || email.split('@')[0] || 'Player').trim();
      gamerTag = String(req.body.gamerTag || email.split('@')[0] || 'GooglePlayer').trim();
      googleSub = `google_${Date.now()}`;
    }

    if (!email) {
      return res.status(400).json({ message: 'Google account details could not be verified. Please enter your Gmail address.' });
    }

    const users = readUsers();
    if (!users[email]) {
      users[email] = {
        id: crypto.randomUUID(),
        firstName,
        name: firstName,
        gamerTag,
        gamerName: gamerTag,
        email,
        rating: 1000,
        wins: 0,
        draws: 0,
        losses: 0,
        rankedMatches: 0,
        passwordHash: null,
        verified: true,
        verificationTokenHash: null,
        verificationExpires: null,
        resetTokenHash: null,
        resetExpires: null,
        googleSub,
        sessionTokenHash: null,
        sessionExpires: null
      };
    } else {
      users[email].firstName = users[email].firstName || firstName;
      users[email].gamerTag = users[email].gamerTag || gamerTag;
      users[email].email = email;
      users[email].verified = true;
      if (googleSub) users[email].googleSub = googleSub;
    }

    ensureMatchProfile(users[email]);
    setSessionCookie(req, res, users[email], true);
    writeUsers(users);

    res.json({ ok: true, ...publicProfile(users[email]) });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }
});

app.get('/api/profile', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ profile: publicProfile(user), ownerConfigured: Boolean(OWNER_EMAIL), emailDelivery: Boolean(mailer) });
});

app.patch('/api/profile', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const firstName = String(req.body.firstName || '').trim();
  const gamerTag = String(req.body.gamerTag || '').trim();
  if (firstName.length < 2 || firstName.length > 60) return res.status(400).json({ message: 'Name must be between 2 and 60 characters.' });
  if (gamerTag.length < 3 || gamerTag.length > 32) return res.status(400).json({ message: 'Gamer tag must be between 3 and 32 characters.' });
  const users = readUsers();
  const duplicate = Object.values(users).some((candidate) => candidate.verified && candidate.email !== user.email && candidate.gamerTag.toLowerCase() === gamerTag.toLowerCase());
  if (duplicate) return res.status(409).json({ message: 'That gamer tag is already in use.' });
  user.firstName = firstName;
  user.gamerTag = gamerTag;
  users[user.email] = user;
  writeUsers(users);
  res.json({ profile: publicProfile(user) });
});

app.get('/api/players', (req, res) => {
  const query = String(req.query.search || '').trim().toLocaleLowerCase();
  if (query.length > 50) return res.status(400).json({ message: 'Search text is too long.' });
  const users = readUsers();
  const players = Object.values(users)
    .filter((candidate) => safeEmail(String(candidate.email || '')) && String(candidate.gamerTag || '').toLocaleLowerCase().includes(query))
    .sort((a, b) => a.gamerTag.localeCompare(b.gamerTag))
    .map((candidate) => {
      ensureMatchProfile(candidate);
      return publicMatchProfile(candidate);
    });
  writeUsers(users);
  res.json({ players });
});

app.get('/api/rankings/live', (req, res) => {
  const users = readUsers();
  const players = Object.values(users).filter((candidate) => safeEmail(String(candidate.email || '')) && candidate.gamerTag);
  let changed = false;
  for (const player of players) changed = ensureMatchProfile(player) || changed;
  if (changed) writeUsers(users);
  players.sort((a, b) => b.rating - a.rating || a.gamerTag.localeCompare(b.gamerTag));
  res.json({
    players: players.map((player, index) => ({ rank: index + 1, ...publicMatchProfile(player) })),
    updatedAt: new Date().toISOString(),
    ratingSystem: 'Elo, K=32; new profiles start at 1000.'
  });
});

app.get('/api/matches/:id', (req, res) => {
  const match = readMatches()[req.params.id];
  const email = matchParticipantEmail(req, match);
  if (!match || !email) return res.status(401).json({ message: 'Open the private match link sent to your profile email to view this match.' });
  res.setHeader('Cache-Control', 'private, no-store');
  const users = readUsers();
  const serialized = publicMatch(match, email, users);
  if (!serialized) return res.status(404).json({ message: 'Match players could not be found.' });
  res.json({ match: serialized });
});

app.post('/api/matches', async (req, res) => {
  const challengerId = String(req.body.challengerId || '');
  const opponentId = String(req.body.opponentId || '');
  const scheduledAt = String(req.body.scheduledAt || '');
  const timeZone = normalizedTimeZone(req.body.timeZone);
  const ranked = req.body.ranked === true;
  const reminderMinutes = Number(req.body.reminderMinutes);
  const scheduledTime = Date.parse(scheduledAt);
  const allowedReminders = new Set([15, 30, 60, 1440]);
  if (!timeZone) return res.status(400).json({ message: 'A valid local time zone is required to schedule the match.' });
  if (!challengerId || !opponentId || challengerId === opponentId || !Number.isFinite(scheduledTime) || scheduledTime < Date.now() + 5 * 60 * 1000 || scheduledTime > Date.now() + 60 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ message: 'Choose a match time at least 5 minutes from now and within the next 60 days.' });
  }
  if (!allowedReminders.has(reminderMinutes)) return res.status(400).json({ message: 'Choose a reminder between 15 minutes and 24 hours before kick-off.' });
  const users = readUsers();
  const challenger = Object.values(users).find((candidate) => candidate.id === challengerId && safeEmail(String(candidate.email || '')));
  const opponent = Object.values(users).find((candidate) => candidate.id === opponentId && safeEmail(String(candidate.email || '')));
  if (!challenger) return res.status(404).json({ message: 'Choose a player profile already on the website.' });
  if (!opponent) return res.status(404).json({ message: 'That player profile with a linked email address could not be found.' });
  if (opponent.email === challenger.email) return res.status(400).json({ message: 'You cannot challenge your own profile.' });
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const recentRequests = (challengeRequestsByIp.get(ip) || []).filter((timestamp) => timestamp > now - 60 * 60 * 1000);
  if (recentRequests.length >= 5) return res.status(429).json({ message: 'Too many invitations were sent from this connection. Try again later.' });
  recentRequests.push(now);
  challengeRequestsByIp.set(ip, recentRequests);
  const matches = readMatches();
  const duplicate = Object.values(matches).some((match) => (
    match.status === 'pending' &&
    ((match.challengerEmail === challenger.email && match.opponentEmail === opponent.email) ||
      (match.challengerEmail === opponent.email && match.opponentEmail === challenger.email))
  ));
  if (duplicate) return res.status(409).json({ message: 'There is already a pending invitation between these players.' });
  const id = crypto.randomUUID();
  const challengerToken = createToken();
  const opponentToken = createToken();
  const tokenExpiry = now + 180 * 24 * 60 * 60 * 1000;
  const match = {
    id,
    challengerEmail: challenger.email,
    opponentEmail: opponent.email,
    ranked,
    scheduledAt: new Date(scheduledTime).toISOString(),
    timeZone,
    reminderMinutes,
    status: 'pending',
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    reminderSentTo: {},
    accessTokens: {
      [challenger.email]: { tokenHash: hashToken(challengerToken), expiresAt: tokenExpiry },
      [opponent.email]: { tokenHash: hashToken(opponentToken), expiresAt: tokenExpiry }
    },
    emailStatus: { challenger: 'pending', opponent: 'pending' },
    result: null
  };
  matches[id] = match;
  writeMatches(matches);
  const participantEmails = [
    {
      role: 'challenger',
      user: challenger,
      token: challengerToken,
      subject: `Your ${ranked ? 'ranked' : 'friendly'} eFootball challenge was created`,
      title: 'Your challenge is ready',
      message: `You selected ${opponent.gamerTag} for a ${ranked ? 'ranked' : 'friendly'} match at ${formatMatchTime(scheduledTime, timeZone)} (${timeZone}). Use this private link to view the invitation and manage the match.`
    },
    {
      role: 'opponent',
      user: opponent,
      token: opponentToken,
      subject: `${challenger.gamerTag} challenged you to an eFootball match`,
      title: 'You have a match invitation',
      message: `${challenger.gamerTag} invited you to a ${ranked ? 'ranked' : 'friendly'} match at ${formatMatchTime(scheduledTime, timeZone)} (${timeZone}). Open your private link to accept or decline.`
    }
  ];
  await Promise.all(participantEmails.map(async ({ role, user: recipient, token, subject, title, message }) => {
    try {
      await sendEmail({
        to: recipient.email,
        subject,
        html: emailLayout(title, message, `${BASE_URL}/matches.html#match=${encodeURIComponent(id)}&access=${encodeURIComponent(token)}`, 'Open private match link', recipient.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
      });
      match.emailStatus[role] = 'sent';
    } catch (error) {
      console.error(`${role} match invitation email failed for match ${id}:`, error);
      match.emailStatus[role] = 'failed';
    }
  }));
  if (match.emailStatus.challenger !== 'sent' && match.emailStatus.opponent !== 'sent') {
    delete matches[id];
    writeMatches(matches);
    return res.status(503).json({ message: 'Neither player received a private match link, so the invitation was not saved. Check email delivery and try again.' });
  }
  matches[id] = match;
  writeMatches(matches);
  res.status(201).json({
    ok: true,
    match: publicMatch(match, challenger.email, users),
    emailSent: match.emailStatus.challenger === 'sent' && match.emailStatus.opponent === 'sent',
    message: match.emailStatus.challenger === 'sent' && match.emailStatus.opponent === 'sent'
      ? 'Private match links sent to both players’ profile emails.'
      : 'The match was saved, but one or both emails could not be delivered. Check server email settings before trying again.'
  });
});

app.post('/api/matches/:id/respond', async (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const email = matchParticipantEmail(req, match);
  if (!match || !email) return res.status(401).json({ message: 'Open the private match link sent to the invited player’s profile email.' });
  if (email !== match.opponentEmail) return res.status(403).json({ message: 'Only the invited opponent can respond to this invitation.' });
  const action = String(req.body.action || '');
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ message: 'Choose accept or decline.' });
  if (match.status !== 'pending') return res.status(409).json({ message: 'This invitation is no longer awaiting a response.' });
  const users = readUsers();
  const challenger = users[match.challengerEmail];
  const opponent = users[match.opponentEmail];
  match.status = action === 'accept' ? 'accepted' : 'declined';
  if (action === 'accept') match.acceptedAt = new Date().toISOString();
  writeMatches(matches);
  const challengerToken = createToken();
  let emailSent = true;
  try {
    await sendEmail({
      to: challenger.email,
      subject: `${opponent.gamerTag} ${action === 'accept' ? 'accepted' : 'declined'} your match invitation`,
      html: emailLayout(`Invitation ${action === 'accept' ? 'accepted' : 'declined'}`, `${opponent.gamerTag} ${action === 'accept' ? 'accepted your match invitation.' : 'declined your match invitation.'}${action === 'accept' ? ` The match is scheduled for ${formatMatchTime(match.scheduledAt, match.timeZone)} (${match.timeZone || 'UTC'}).` : ''}`, `${BASE_URL}/matches.html#match=${encodeURIComponent(match.id)}&access=${encodeURIComponent(challengerToken)}`, 'Open private match link', challenger.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
    });
    match.accessTokens[challenger.email] = { tokenHash: hashToken(challengerToken), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
    match.emailStatus.challenger = 'sent';
    writeMatches(matches);
  } catch (error) {
    console.error('Match response email failed:', error);
    emailSent = false;
  }
  res.json({ ok: true, status: match.status, emailSent, match: publicMatch(match, email, users) });
});

app.post('/api/matches/:id/resend-invitation', async (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const email = matchParticipantEmail(req, match);
  if (!match || !email) return res.status(401).json({ message: 'Open your private match link from your profile email.' });
  if (match.challengerEmail !== email || match.status !== 'pending') return res.status(404).json({ message: 'Pending invitation not found.' });
  const users = readUsers();
  const challenger = users[match.challengerEmail];
  const opponent = users[match.opponentEmail];
  const opponentToken = createToken();
  try {
    await sendEmail({
      to: opponent.email,
      subject: `${challenger.gamerTag} sent you an eFootball match invitation`,
      html: emailLayout('Match invitation reminder', `${challenger.gamerTag} is waiting for your response to a ${match.ranked ? 'ranked' : 'friendly'} match invitation.`, `${BASE_URL}/matches.html#match=${encodeURIComponent(match.id)}&access=${encodeURIComponent(opponentToken)}`, 'View private invitation', opponent.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
    });
    match.accessTokens[opponent.email] = { tokenHash: hashToken(opponentToken), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
    match.emailStatus.opponent = 'sent';
    writeMatches(matches);
    res.json({ ok: true });
  } catch (error) {
    console.error('Invitation resend failed:', error);
    match.emailStatus.opponent = 'failed';
    writeMatches(matches);
    res.status(503).json({ message: 'The invitation email could not be sent. Check email delivery and try again.' });
  }
});

const saveScoreEvidence = (matchId, userId, evidence) => {
  if (typeof evidence !== 'string') throw new Error('Add a screenshot of the in-game scoreline.');
  const parsed = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(evidence);
  if (!parsed) throw new Error('Upload a PNG, JPEG, or WebP screenshot.');
  const contents = Buffer.from(parsed[2], 'base64');
  if (!contents.length || contents.length > 5 * 1024 * 1024) throw new Error('Screenshots must be smaller than 5 MB.');
  const declaredType = parsed[1];
  const isPng = contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff;
  const isWebp = contents.length >= 12 && contents.toString('ascii', 0, 4) === 'RIFF' && contents.toString('ascii', 8, 12) === 'WEBP';
  if ((declaredType === 'png' && !isPng) || (declaredType === 'jpeg' && !isJpeg) || (declaredType === 'webp' && !isWebp)) {
    throw new Error('The screenshot content does not match its image type.');
  }
  const extension = parsed[1] === 'jpeg' ? 'jpg' : parsed[1];
  const file = `${matchId}-${userId}.${extension}`;
  fs.writeFileSync(path.join(EVIDENCE_DIR, file), contents, { mode: 0o600 });
  return { file, contentType: `image/${parsed[1]}`, uploadedAt: new Date().toISOString() };
};

app.post('/api/matches/:id/result', async (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const email = matchParticipantEmail(req, match);
  if (!match || !email) return res.status(401).json({ message: 'Open the private match link sent to your profile email to report a result.' });
  if (!['accepted', 'awaiting-opponent', 'disputed', 'rejected'].includes(match.status)) return res.status(409).json({ message: 'This match is not ready for a result report.' });
  if (Date.now() < Date.parse(match.scheduledAt)) return res.status(400).json({ message: 'You can report the score after the scheduled kick-off time.' });
  if (!validScore(req.body.yourScore) || !validScore(req.body.opponentScore)) return res.status(400).json({ message: 'Enter whole-number scores from 0 to 99.' });
  const user = readUsers()[email];
  if (!user) return res.status(404).json({ message: 'The player profile for this match is unavailable.' });
  let evidence;
  try {
    evidence = saveScoreEvidence(match.id, user.id, req.body.evidence);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const isChallenger = user.email === match.challengerEmail;
  const report = {
    challengerScore: isChallenger ? req.body.yourScore : req.body.opponentScore,
    opponentScore: isChallenger ? req.body.opponentScore : req.body.yourScore,
    evidence,
    submittedAt: new Date().toISOString()
  };
  if (!match.result) match.result = { reports: {}, confirmations: {} };
  if (!match.result.reports) match.result.reports = {};
  if (match.status === 'rejected') delete match.result.reviewNote;
  match.result.reports[user.email] = report;
  const otherEmail = isChallenger ? match.opponentEmail : match.challengerEmail;
  const otherReport = match.result.reports[otherEmail];
  match.result.confirmations[user.email] = true;
  match.status = !otherReport
    ? 'awaiting-opponent'
    : report.challengerScore === otherReport.challengerScore && report.opponentScore === otherReport.opponentScore
      ? 'pending-owner'
      : 'disputed';
  writeMatches(matches);
  const users = readUsers();
  let opponentNotified = null;
  let ownerNotified = null;
  if (!otherReport && users[otherEmail]) {
    const opponent = users[otherEmail];
    const opponentToken = createToken();
    try {
      await sendEmail({
        to: opponent.email,
        subject: `${user.gamerTag} submitted a match score`,
        html: emailLayout('Your opponent reported the score', `${user.gamerTag} submitted ${report.challengerScore} – ${report.opponentScore}. Open your private link to report your score and upload your own screenshot.`, `${BASE_URL}/matches.html#match=${encodeURIComponent(match.id)}&access=${encodeURIComponent(opponentToken)}`, 'Review private match', opponent.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
      });
      match.accessTokens[otherEmail] = { tokenHash: hashToken(opponentToken), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
      writeMatches(matches);
      opponentNotified = true;
    } catch (error) {
      console.error(`Opponent score notification failed for match ${match.id}:`, error);
      opponentNotified = false;
    }
  }
  if (['pending-owner', 'disputed'].includes(match.status) && OWNER_EMAIL && OWNER_REVIEW_TOKEN.length >= 32) {
    try {
      await sendEmail({
        to: OWNER_EMAIL,
        subject: `Match result needs review: ${users[match.challengerEmail]?.gamerTag || 'Player'} vs ${users[match.opponentEmail]?.gamerTag || 'Player'}`,
        html: emailLayout('Match result awaiting review', `Both players have submitted score evidence. The match is ${match.status === 'disputed' ? 'disputed' : 'ready for approval'}. Review both screenshots and decide the verified score in the owner panel.`, `${BASE_URL}/matches.html#owner=${encodeURIComponent(OWNER_REVIEW_TOKEN)}`, 'Review result', '', 'This private owner link grants access to match review. Keep it secret; change OWNER_REVIEW_TOKEN to revoke old links.')
      });
      ownerNotified = true;
    } catch (error) {
      console.error(`Owner result notification failed for match ${match.id}:`, error);
      ownerNotified = false;
    }
  }
  const ownerReviewConfigured = Boolean(OWNER_EMAIL && OWNER_REVIEW_TOKEN.length >= 32);
  res.json({
    ok: true,
    status: match.status,
    opponentNotified,
    ownerNotified,
    message: match.status === 'pending-owner'
      ? `Both reports match.${ownerNotified ? ' The owner has been notified for review.' : ownerNotified === false ? ' Owner notification email failed; review is still available from the private owner link.' : ownerReviewConfigured ? ' The owner can review it from the private owner link.' : ' Owner review is not configured; the owner must set OWNER_EMAIL and OWNER_REVIEW_TOKEN.'}`
      : match.status === 'disputed'
        ? `The reports differ.${ownerNotified ? ' The owner has been notified to review both screenshots.' : ownerNotified === false ? ' Owner notification email failed; review is still available from the private owner link.' : ownerReviewConfigured ? ' The owner can review both screenshots from the private owner link.' : ' Owner review is not configured; the owner must set OWNER_EMAIL and OWNER_REVIEW_TOKEN.'}`
        : `Score submitted.${opponentNotified === false ? ' The opponent email could not be delivered; please contact them directly.' : ' Waiting for your opponent to confirm with their own report.'}`,
    ownerReviewConfigured
  });
});

app.post('/api/matches/:id/cancel', (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const email = matchParticipantEmail(req, match);
  if (!match || !email) return res.status(401).json({ message: 'Open your private match link from your profile email.' });
  if (match.challengerEmail !== email || match.status !== 'pending') return res.status(404).json({ message: 'Pending invitation not found.' });
  match.status = 'cancelled';
  writeMatches(matches);
  res.json({ ok: true });
});

app.get('/api/admin/matches', (req, res) => {
  if (!OWNER_EMAIL || !ownerReviewAuthorized(req)) return res.status(403).json({ message: 'Owner review requires the private link from the owner review email.' });
  res.setHeader('Cache-Control', 'private, no-store');
  const users = readUsers();
  const matches = Object.values(readMatches())
    .filter((match) => ['pending-owner', 'disputed'].includes(match.status))
    .map((match) => ({
      ...publicMatch(match, OWNER_EMAIL, users),
      reports: Object.entries(match.result?.reports || {}).map(([email, report]) => ({
        player: users[email] ? publicMatchProfile(users[email]) : null,
        challengerScore: report.challengerScore,
        opponentScore: report.opponentScore,
        submittedAt: report.submittedAt,
        evidenceAvailable: Boolean(report.evidence?.file)
      }))
    }))
    .filter((match) => match.challenger && match.opponent);
  res.json({ matches });
});

app.get('/api/admin/matches/:id/evidence/:playerId', (req, res) => {
  if (!OWNER_EMAIL || !ownerReviewAuthorized(req)) return res.sendStatus(403);
  res.setHeader('Cache-Control', 'private, no-store');
  const match = readMatches()[req.params.id];
  if (!match) return res.sendStatus(404);
  const player = Object.values(readUsers()).find((candidate) => candidate.id === req.params.playerId);
  const report = player && match.result?.reports?.[player.email];
  if (!report?.evidence?.file) return res.sendStatus(404);
  const file = path.join(EVIDENCE_DIR, path.basename(report.evidence.file));
  if (!fs.existsSync(file)) return res.status(404).json({ message: 'The evidence file is unavailable.' });
  res.setHeader('Content-Type', report.evidence.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file);
});

app.post('/api/admin/matches/:id/decision', async (req, res) => {
  if (!OWNER_EMAIL || !ownerReviewAuthorized(req)) return res.status(403).json({ message: 'Owner review requires the private link from the owner review email.' });
  const decision = String(req.body.decision || '');
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Choose approve or reject.' });
  const matches = readMatches();
  const match = matches[req.params.id];
  if (!match || !['pending-owner', 'disputed'].includes(match.status) || !match.result?.reports) return res.status(404).json({ message: 'This result is no longer awaiting review.' });
  const reports = Object.values(match.result.reports);
  if (reports.length < 2) return res.status(409).json({ message: 'Both players must submit a score and screenshot before owner review.' });
  if (decision === 'reject') {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: 'Provide a review note between 5 and 500 characters.' });
    match.result.previousReports ||= [];
    match.result.previousReports.push({ reports: match.result.reports, rejectedAt: new Date().toISOString(), note: reason });
    match.result.reports = {};
    match.result.confirmations = {};
    match.status = 'rejected';
    match.result.reviewNote = reason;
    match.result.reviewedAt = new Date().toISOString();
    writeMatches(matches);
    const users = readUsers();
    const notifications = await Promise.all([match.challengerEmail, match.opponentEmail].map(async (email) => {
      const recipient = users[email];
      if (!recipient) return false;
      try {
        return await notifyMatchParticipant(match, recipient, {
          subject: 'The owner requested a match result clarification',
          title: 'Please review your match result',
          message: `The owner could not approve this result: ${reason} Both players can open their private match links and submit fresh scores and screenshots.`
        });
      } catch (error) {
        console.error(`Result rejection email failed for match ${match.id}:`, error);
        return false;
      }
    }));
    writeMatches(matches);
    return res.json({ ok: true, status: match.status, emailsSent: notifications.every(Boolean) });
  }
  const challengerScore = Number(req.body.challengerScore);
  const opponentScore = Number(req.body.opponentScore);
  if (!validScore(challengerScore) || !validScore(opponentScore)) return res.status(400).json({ message: 'Enter the verified final score from 0 to 99.' });
  if (reports.some((report) => !report.evidence?.file || !fs.existsSync(path.join(EVIDENCE_DIR, path.basename(report.evidence.file))))) {
    return res.status(409).json({ message: 'Both player screenshots must be available before approving this result. Ask players to submit their evidence again.' });
  }
  match.result.challengerScore = challengerScore;
  match.result.opponentScore = opponentScore;
  match.result.approvedAt = new Date().toISOString();
  match.result.approvedBy = OWNER_EMAIL;
  match.result.reviewNote = String(req.body.note || '').trim().slice(0, 500);

  const users = readUsers();
  const challenger = users[match.challengerEmail];
  const opponent = users[match.opponentEmail];
  if (!challenger || !opponent) return res.status(409).json({ message: 'A player account for this match could not be found.' });
  if (match.ranked) {
    ensureMatchProfile(challenger);
    ensureMatchProfile(opponent);
    const expectedChallenger = 1 / (1 + (10 ** ((opponent.rating - challenger.rating) / 400)));
    const actualChallenger = challengerScore > opponentScore ? 1 : challengerScore < opponentScore ? 0 : 0.5;
    const challengerChange = Math.round(32 * (actualChallenger - expectedChallenger));
    const opponentChange = -challengerChange;
    challenger.rating += challengerChange;
    opponent.rating += opponentChange;
    challenger.rankedMatches += 1;
    opponent.rankedMatches += 1;
    match.result.ratingChanges = { challenger: challengerChange, opponent: opponentChange, system: 'Elo K=32' };
    if (challengerScore > opponentScore) {
      challenger.wins += 1;
      opponent.losses += 1;
    } else if (challengerScore < opponentScore) {
      challenger.losses += 1;
      opponent.wins += 1;
    } else {
      challenger.draws += 1;
      opponent.draws += 1;
    }
    writeUsers(users);
  }
  match.status = 'approved';
  writeMatches(matches);
  const notifications = await Promise.all([challenger, opponent].map(async (recipient) => {
    try {
      return await notifyMatchParticipant(match, recipient, {
        subject: 'Your match result was approved',
        title: 'Match result approved',
        message: `The owner approved the final score ${challenger.gamerTag} ${challengerScore} – ${opponentScore} ${opponent.gamerTag}.${match.ranked ? ` Ranked Elo changes: ${challenger.gamerTag} ${match.result.ratingChanges.challenger > 0 ? '+' : ''}${match.result.ratingChanges.challenger}; ${opponent.gamerTag} ${match.result.ratingChanges.opponent > 0 ? '+' : ''}${match.result.ratingChanges.opponent}.` : ' This friendly result did not change Elo ratings.'}`
      });
    } catch (error) {
      console.error(`Result approval email failed for match ${match.id} to ${recipient.email}:`, error);
      return false;
    }
  }));
  writeMatches(matches);
  res.json({ ok: true, status: match.status, ranked: match.ranked, ratingChanges: match.result.ratingChanges || null, emailsSent: notifications.every(Boolean) });
});

/* ==========================================================================
   ADMIN OPERATIONS & LIVE CONTENT MANAGEMENT API
   ========================================================================== */

// Helper to compute and apply match outcome to player ratings & records
const applyMatchOutcome = (challenger, opponent, challengerScore, opponentScore, isRanked = true) => {
  ensureMatchProfile(challenger);
  ensureMatchProfile(opponent);

  let ratingChanges = null;
  if (isRanked) {
    const expectedChallenger = 1 / (1 + (10 ** ((opponent.rating - challenger.rating) / 400)));
    const actualChallenger = challengerScore > opponentScore ? 1 : challengerScore < opponentScore ? 0 : 0.5;
    const challengerChange = Math.round(32 * (actualChallenger - expectedChallenger));
    const opponentChange = -challengerChange;
    challenger.rating = Math.max(100, challenger.rating + challengerChange);
    opponent.rating = Math.max(100, opponent.rating + opponentChange);
    challenger.rankedMatches = (challenger.rankedMatches || 0) + 1;
    opponent.rankedMatches = (opponent.rankedMatches || 0) + 1;
    ratingChanges = { challenger: challengerChange, opponent: opponentChange, system: 'Elo K=32' };
  }

  if (challengerScore > opponentScore) {
    challenger.wins += 1;
    opponent.losses += 1;
  } else if (challengerScore < opponentScore) {
    challenger.losses += 1;
    opponent.wins += 1;
  } else {
    challenger.draws += 1;
    opponent.draws += 1;
  }

  return ratingChanges;
};

// 1. Admin Login (Key or Email+Password)
app.post('/api/admin/login', async (req, res) => {
  const { key, email, password } = req.body || {};

  // Check Master Token / Secret Admin Password
  const enteredKey = String(key || '').trim();
  if (enteredKey) {
    const isMasterMatch = Boolean(
      (ADMIN_KEY && (enteredKey === ADMIN_KEY || safeTokenEqual(ADMIN_KEY, enteredKey))) ||
      (ADMIN_PASSWORD && (enteredKey === ADMIN_PASSWORD || safeTokenEqual(ADMIN_PASSWORD, enteredKey))) ||
      (OWNER_REVIEW_TOKEN.length >= 16 && (enteredKey === OWNER_REVIEW_TOKEN || safeTokenEqual(hashToken(OWNER_REVIEW_TOKEN), enteredKey) || safeTokenEqual(hashToken(OWNER_REVIEW_TOKEN), hashToken(enteredKey))))
    );

    if (isMasterMatch) {
      const users = readUsers();
      const defaultEmail = OWNER_EMAIL || 'admin@timleague.com';
      let adminUser = users[defaultEmail] || Object.values(users).find(u => u.role === 'admin');
      if (!adminUser) {
        adminUser = {
          id: crypto.randomUUID(),
          email: defaultEmail,
          firstName: 'System',
          name: 'Owner Admin',
          gamerTag: 'TimAdmin',
          gamerName: 'TimAdmin',
          verified: true,
          role: 'admin',
          rating: 1500,
          wins: 0, draws: 0, losses: 0, rankedMatches: 0
        };
        users[defaultEmail] = adminUser;
      }
      adminUser.verified = true;
      adminUser.role = 'admin';
      setSessionCookie(req, res, adminUser);
      writeUsers(users);
      return res.json({ ok: true, admin: true, token: ADMIN_KEY || OWNER_REVIEW_TOKEN, user: publicProfile(adminUser) });
    }
  }

  // Check Email & Password
  if (email && password) {
    const users = readUsers();
    const cleanEmail = String(email).trim().toLowerCase();
    const isOwner = Boolean(OWNER_EMAIL && cleanEmail === OWNER_EMAIL);

    // If owner email signs in with ADMIN_KEY or ADMIN_PASSWORD master secret
    if (isOwner && (password === ADMIN_KEY || password === ADMIN_PASSWORD)) {
      let adminUser = users[cleanEmail] || {
        id: crypto.randomUUID(),
        email: cleanEmail,
        firstName: 'Owner',
        name: 'Owner Admin',
        gamerTag: 'TimOwner',
        gamerName: 'TimOwner',
        rating: 1500,
        wins: 0, draws: 0, losses: 0, rankedMatches: 0
      };
      adminUser.verified = true;
      adminUser.role = 'admin';
      users[cleanEmail] = adminUser;
      setSessionCookie(req, res, adminUser);
      writeUsers(users);
      return res.json({ ok: true, admin: true, token: ADMIN_KEY || OWNER_REVIEW_TOKEN, user: publicProfile(adminUser) });
    }

    const user = users[cleanEmail];
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }
    const isMatch = await verifyPassword(password, user.passwordHash);
    const isOwnerOrAdmin = Boolean(user.role === 'admin' || isOwner);
    if (!isMatch || !isOwnerOrAdmin) {
      return res.status(401).json({ message: 'Invalid admin credentials or insufficient privileges.' });
    }
    user.verified = true;
    user.role = 'admin';
    setSessionCookie(req, res, user);
    writeUsers(users);
    return res.json({ ok: true, admin: true, token: ADMIN_KEY || OWNER_REVIEW_TOKEN, user: publicProfile(user) });
  }

  return res.status(400).json({ message: 'Invalid master secret password or admin credentials.' });
});

// 2. Admin Session Check
app.get('/api/admin/session', requireAdmin, (req, res) => {
  const users = readUsers();
  const sessionUser = findSessionUser(req, users) || (OWNER_EMAIL ? users[OWNER_EMAIL] : null);
  res.json({
    ok: true,
    isAdmin: true,
    user: sessionUser ? publicProfile(sessionUser) : { gamerTag: 'Admin', role: 'admin' }
  });
});

// 3. Admin Overview Metrics
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const users = readUsers();
  const matches = readMatches();
  const userList = Object.values(users);
  const matchList = Object.values(matches);

  const totalUsers = userList.length;
  const verifiedUsers = userList.filter((u) => u.verified).length;
  const totalMatches = matchList.length;
  const pendingReviews = matchList.filter((m) => ['pending-owner', 'disputed'].includes(m.status)).length;
  const activeFixtures = matchList.filter((m) => ['accepted', 'awaiting-opponent', 'pending'].includes(m.status)).length;
  const approvedMatches = matchList.filter((m) => m.status === 'approved').length;

  const sortedPlayers = [...userList].sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
  const topPlayer = sortedPlayers[0] ? {
    gamerTag: sortedPlayers[0].gamerTag || sortedPlayers[0].gamerName,
    rating: sortedPlayers[0].rating || 1000,
    wins: sortedPlayers[0].wins || 0
  } : null;

  const announcement = getSiteContent('announcement', { active: false });

  res.json({
    ok: true,
    stats: {
      totalUsers,
      verifiedUsers,
      totalMatches,
      pendingReviews,
      activeFixtures,
      approvedMatches,
      topPlayer,
      announcementActive: Boolean(announcement && announcement.active)
    }
  });
});

// 4. Admin Users List
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readUsers();
  const userList = Object.values(users)
    .sort((a, b) => (b.rating || 1000) - (a.rating || 1000))
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.firstName || u.name,
      gamerTag: u.gamerTag || u.gamerName,
      rating: u.rating || 1000,
      wins: u.wins || 0,
      draws: u.draws || 0,
      losses: u.losses || 0,
      rankedMatches: u.rankedMatches || (u.wins || 0) + (u.draws || 0) + (u.losses || 0),
      verified: Boolean(u.verified),
      role: u.role || ((OWNER_EMAIL && u.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) ? 'admin' : 'user'),
      isOwner: Boolean(OWNER_EMAIL && u.email.toLowerCase() === OWNER_EMAIL.toLowerCase())
    }));
  res.json({ ok: true, users: userList });
});

// 5. Admin Add User Live
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { email, gamerTag, name, rating, wins, draws, losses, verified, role, password } = req.body || {};
  if (!email || !gamerTag) return res.status(400).json({ message: 'Email and gamer tag are required.' });
  const cleanEmail = String(email).trim().toLowerCase();
  const users = readUsers();
  if (users[cleanEmail]) return res.status(409).json({ message: 'A player with this email already exists.' });

  let passwordHash = null;
  if (password && String(password).length >= 6) {
    passwordHash = await hashPassword(String(password));
  }

  const w = Math.max(0, Number(wins) || 0);
  const d = Math.max(0, Number(draws) || 0);
  const l = Math.max(0, Number(losses) || 0);

  const newUser = {
    id: crypto.randomUUID(),
    email: cleanEmail,
    firstName: String(name || gamerTag).trim(),
    name: String(name || gamerTag).trim(),
    gamerTag: String(gamerTag).trim(),
    gamerName: String(gamerTag).trim(),
    rating: Number.isSafeInteger(Number(rating)) ? Number(rating) : 1200,
    wins: w,
    draws: d,
    losses: l,
    rankedMatches: w + d + l,
    verified: verified !== false,
    role: role === 'admin' ? 'admin' : 'user',
    passwordHash,
    createdAt: new Date().toISOString()
  };

  users[cleanEmail] = newUser;
  writeUsers(users);
  res.json({ ok: true, user: publicProfile(newUser), message: `Player ${newUser.gamerTag} created successfully.` });
});

// 6. Admin Update User Live
app.put('/api/admin/users/:email', requireAdmin, (req, res) => {
  const originalEmail = decodeURIComponent(req.params.email).trim().toLowerCase();
  const users = readUsers();
  const user = users[originalEmail];
  if (!user) return res.status(404).json({ message: 'Player account not found.' });

  const { email, gamerTag, name, rating, wins, draws, losses, verified, role } = req.body || {};

  if (gamerTag) {
    user.gamerTag = String(gamerTag).trim();
    user.gamerName = String(gamerTag).trim();
  }
  if (name) {
    user.firstName = String(name).trim();
    user.name = String(name).trim();
  }
  if (rating !== undefined && Number.isSafeInteger(Number(rating))) {
    user.rating = Number(rating);
  }
  if (wins !== undefined && Number.isSafeInteger(Number(wins))) user.wins = Math.max(0, Number(wins));
  if (draws !== undefined && Number.isSafeInteger(Number(draws))) user.draws = Math.max(0, Number(draws));
  if (losses !== undefined && Number.isSafeInteger(Number(losses))) user.losses = Math.max(0, Number(losses));
  user.rankedMatches = (user.wins || 0) + (user.draws || 0) + (user.losses || 0);

  if (verified !== undefined) user.verified = Boolean(verified);
  if (role) user.role = role === 'admin' ? 'admin' : 'user';

  // If email address was edited
  if (email && String(email).trim().toLowerCase() !== originalEmail) {
    const newEmail = String(email).trim().toLowerCase();
    if (users[newEmail]) return res.status(409).json({ message: 'That email is already registered to another player.' });
    user.email = newEmail;
    delete users[originalEmail];
    deleteUser.run(originalEmail);
    users[newEmail] = user;
  }

  writeUsers(users);
  res.json({ ok: true, user: publicProfile(user), message: `Player ${user.gamerTag} updated live.` });
});

// 7. Admin Delete User Live
app.delete('/api/admin/users/:email', requireAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email).trim().toLowerCase();
  const users = readUsers();
  if (!users[email]) return res.status(404).json({ message: 'Player account not found.' });
  if (OWNER_EMAIL && email === OWNER_EMAIL) {
    return res.status(400).json({ message: 'The primary owner account cannot be deleted.' });
  }
  const deletedTag = users[email].gamerTag || email;
  delete users[email];
  deleteUser.run(email);
  res.json({ ok: true, message: `Player ${deletedTag} deleted successfully.` });
});

// 8. Admin Reset Password Live
app.post('/api/admin/users/:email/reset-password', requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email).trim().toLowerCase();
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  const users = readUsers();
  const user = users[email];
  if (!user) return res.status(404).json({ message: 'Player account not found.' });

  user.passwordHash = await hashPassword(String(newPassword));
  user.sessionTokenHash = null;
  writeUsers(users);
  res.json({ ok: true, message: `Password for ${user.gamerTag || email} has been updated.` });
});

// 9. Admin All Matches List
app.get('/api/admin/all-matches', requireAdmin, (req, res) => {
  const matches = readMatches();
  const users = readUsers();
  const list = Object.values(matches).map((m) => {
    const challenger = users[m.challengerEmail] || { gamerTag: m.challengerEmail };
    const opponent = users[m.opponentEmail] || { gamerTag: m.opponentEmail };
    return {
      id: m.id,
      competition: m.competition || 'open',
      ranked: Boolean(m.ranked),
      status: m.status,
      scheduledAt: m.scheduledAt,
      timeZone: m.timeZone,
      challenger: { email: m.challengerEmail, gamerTag: challenger.gamerTag, rating: challenger.rating },
      opponent: { email: m.opponentEmail, gamerTag: opponent.gamerTag, rating: opponent.rating },
      scores: m.result ? { challenger: m.result.challengerScore, opponent: m.result.opponentScore } : null,
      reports: m.result?.reports ? Object.entries(m.result.reports).map(([em, rep]) => ({
        playerEmail: em,
        playerTag: users[em]?.gamerTag || em,
        challengerScore: rep.challengerScore,
        opponentScore: rep.opponentScore,
        hasEvidence: Boolean(rep.evidence?.file)
      })) : [],
      ratingChanges: m.result?.ratingChanges || null,
      reviewNote: m.result?.reviewNote || null
    };
  }).sort((a, b) => Date.parse(b.scheduledAt || 0) - Date.parse(a.scheduledAt || 0));

  res.json({ ok: true, matches: list });
});

// 10. Admin Create Match
app.post('/api/admin/matches', requireAdmin, (req, res) => {
  const { challengerEmail, opponentEmail, competition, scheduledAt, ranked } = req.body || {};
  const users = readUsers();
  const cEmail = String(challengerEmail || '').trim().toLowerCase();
  const oEmail = String(opponentEmail || '').trim().toLowerCase();

  if (!users[cEmail] || !users[oEmail]) {
    return res.status(400).json({ message: 'Both player accounts must exist before creating a fixture.' });
  }
  if (cEmail === oEmail) {
    return res.status(400).json({ message: 'Challenger and opponent must be different players.' });
  }

  const matches = readMatches();
  const matchId = `adm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const newMatch = {
    id: matchId,
    challengerEmail: cEmail,
    opponentEmail: oEmail,
    competition: competition || 'cup',
    ranked: ranked !== false,
    scheduledAt: scheduledAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    timeZone: 'UTC',
    status: 'accepted',
    createdAt: new Date().toISOString(),
    reminderMinutes: 30,
    accessTokens: {},
    emailStatus: {}
  };

  matches[matchId] = newMatch;
  writeMatches(matches);
  res.json({ ok: true, match: newMatch, message: 'Match fixture created.' });
});

// 11. Admin Edit Match Live
app.put('/api/admin/matches/:id', requireAdmin, (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ message: 'Match not found.' });

  const { status, challengerScore, opponentScore, scheduledAt, competition, ranked, reviewNote } = req.body || {};

  if (competition) match.competition = competition;
  if (ranked !== undefined) match.ranked = Boolean(ranked);
  if (scheduledAt) match.scheduledAt = scheduledAt;

  if (challengerScore !== undefined && opponentScore !== undefined && validScore(Number(challengerScore)) && validScore(Number(opponentScore))) {
    match.result ||= {};
    match.result.challengerScore = Number(challengerScore);
    match.result.opponentScore = Number(opponentScore);
  }

  if (reviewNote !== undefined) {
    match.result ||= {};
    match.result.reviewNote = String(reviewNote).trim().slice(0, 500);
  }

  // If status is changed to approved and not yet approved, apply rating changes
  if (status === 'approved' && match.status !== 'approved' && match.result?.challengerScore !== undefined) {
    const users = readUsers();
    const challenger = users[match.challengerEmail];
    const opponent = users[match.opponentEmail];
    if (challenger && opponent) {
      const ratingChanges = applyMatchOutcome(challenger, opponent, match.result.challengerScore, match.result.opponentScore, match.ranked);
      match.result.ratingChanges = ratingChanges;
      match.result.approvedAt = new Date().toISOString();
      match.result.approvedBy = 'Admin Console';
      writeUsers(users);
    }
    match.status = 'approved';
  } else if (status) {
    match.status = status;
  }

  writeMatches(matches);
  res.json({ ok: true, match, message: 'Match updated successfully.' });
});

// 12. Admin Force-Approve Match
app.post('/api/admin/matches/:id/force-approve', requireAdmin, (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ message: 'Match not found.' });

  const challengerScore = Number(req.body.challengerScore);
  const opponentScore = Number(req.body.opponentScore);
  if (!validScore(challengerScore) || !validScore(opponentScore)) {
    return res.status(400).json({ message: 'Scores must be valid numbers between 0 and 99.' });
  }

  match.result ||= {};
  match.result.challengerScore = challengerScore;
  match.result.opponentScore = opponentScore;
  match.result.approvedAt = new Date().toISOString();
  match.result.approvedBy = 'Admin Console (Forced)';
  match.result.reviewNote = String(req.body.note || 'Approved via Admin Console').trim();

  const users = readUsers();
  const challenger = users[match.challengerEmail];
  const opponent = users[match.opponentEmail];
  let ratingChanges = null;
  if (challenger && opponent) {
    ratingChanges = applyMatchOutcome(challenger, opponent, challengerScore, opponentScore, match.ranked);
    match.result.ratingChanges = ratingChanges;
    writeUsers(users);
  }

  match.status = 'approved';
  writeMatches(matches);
  res.json({ ok: true, status: 'approved', ratingChanges, message: `Match force-approved (${challengerScore}–${opponentScore}). Elo updated live.` });
});

// 13. Admin Delete Match
app.delete('/api/admin/matches/:id', requireAdmin, (req, res) => {
  const matches = readMatches();
  if (!matches[req.params.id]) return res.status(404).json({ message: 'Match not found.' });
  delete matches[req.params.id];
  writeMatches(matches);
  res.json({ ok: true, message: 'Match deleted.' });
});

// 14. Admin Live Content Operations
app.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    content: {
      announcement: getSiteContent('announcement'),
      tournaments: getSiteContent('tournaments'),
      clubs: getSiteContent('clubs'),
      bracket: getSiteContent('bracket')
    }
  });
});

app.put('/api/admin/content/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  const validKeys = ['announcement', 'tournaments', 'clubs', 'bracket', 'settings'];
  if (!validKeys.includes(key)) return res.status(400).json({ message: 'Invalid content key.' });
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ message: 'Content data must be a valid JSON object or array.' });
  setSiteContent(key, data);
  res.json({ ok: true, key, message: `Content for ${key} updated live.` });
});

// 15. Admin Recalculate Leaderboard
app.post('/api/admin/rankings/recalculate', requireAdmin, (req, res) => {
  const users = readUsers();
  let updatedCount = 0;
  for (const user of Object.values(users)) {
    if (ensureMatchProfile(user)) updatedCount++;
  }
  if (updatedCount) writeUsers(users);
  res.json({ ok: true, message: `Player rankings verified and refreshed. (${updatedCount} corrected)` });
});

// 16. Public Site Content Endpoints
app.get('/api/site/announcement', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.json({ ok: true, announcement: getSiteContent('announcement', { active: false }) });
});

app.get('/api/site/tournaments', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ ok: true, tournaments: getSiteContent('tournaments', []) });
});

app.get('/api/site/clubs', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ ok: true, clubs: getSiteContent('clubs', []) });
});

app.get('/api/site/bracket', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=15');
  res.json({ ok: true, bracket: getSiteContent('bracket', null) });
});

// --- TOURNAMENTS LIVE MANAGEMENT & REGISTRATION INTEREST ---

// Admin: Create tournament
app.post('/api/admin/tournaments', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const { title, kicker, badge, format, slots, status, dates, desc, registrationOpen, prizePool, minElo, maxElo, entryLink } = req.body || {};
  if (!title || !format) return res.status(400).json({ message: 'Title and format are required.' });
  const newT = {
    id: `tourn-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    title: String(title).trim().slice(0, 80),
    kicker: String(kicker || '').trim().slice(0, 80),
    badge: String(badge || 'EVENT').trim().toUpperCase().slice(0, 20),
    format: String(format).trim().slice(0, 100),
    slots: String(slots || 'TBC').trim(),
    status: ['Registration Open', 'Coming Soon', 'In Progress', 'Completed', 'Cancelled'].includes(status) ? status : 'Coming Soon',
    dates: String(dates || 'TBC').trim().slice(0, 100),
    desc: String(desc || '').trim().slice(0, 500),
    registrationOpen: Boolean(registrationOpen),
    prizePool: String(prizePool || '').trim().slice(0, 100),
    minElo: Number(minElo) || null,
    maxElo: Number(maxElo) || null,
    entryLink: String(entryLink || '').trim().slice(0, 200),
    createdAt: new Date().toISOString()
  };
  tournaments.push(newT);
  setSiteContent('tournaments', tournaments);
  res.status(201).json({ ok: true, tournament: newT, message: `Tournament "${newT.title}" created successfully.` });
});

// Admin: Edit tournament
app.put('/api/admin/tournaments/:id', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const idx = tournaments.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Tournament not found.' });
  const { title, kicker, badge, format, slots, status, dates, desc, registrationOpen, prizePool, minElo, maxElo, entryLink } = req.body || {};
  const t = tournaments[idx];
  if (title) t.title = String(title).trim().slice(0, 80);
  if (kicker !== undefined) t.kicker = String(kicker).trim().slice(0, 80);
  if (badge !== undefined) t.badge = String(badge).trim().toUpperCase().slice(0, 20);
  if (format) t.format = String(format).trim().slice(0, 100);
  if (slots !== undefined) t.slots = String(slots).trim();
  if (status && ['Registration Open', 'Coming Soon', 'In Progress', 'Completed', 'Cancelled'].includes(status)) t.status = status;
  if (dates !== undefined) t.dates = String(dates).trim().slice(0, 100);
  if (desc !== undefined) t.desc = String(desc).trim().slice(0, 500);
  if (registrationOpen !== undefined) t.registrationOpen = Boolean(registrationOpen);
  if (prizePool !== undefined) t.prizePool = String(prizePool).trim().slice(0, 100);
  if (minElo !== undefined) t.minElo = Number(minElo) || null;
  if (maxElo !== undefined) t.maxElo = Number(maxElo) || null;
  if (entryLink !== undefined) t.entryLink = String(entryLink).trim().slice(0, 200);
  t.updatedAt = new Date().toISOString();
  setSiteContent('tournaments', tournaments);
  res.json({ ok: true, tournament: t, message: `Tournament "${t.title}" updated live.` });
});

// Admin: Delete tournament
app.delete('/api/admin/tournaments/:id', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const idx = tournaments.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Tournament not found.' });
  const removed = tournaments.splice(idx, 1)[0];
  setSiteContent('tournaments', tournaments);
  res.json({ ok: true, message: `Tournament "${removed.title}" deleted.` });
});

// User: Register or toggle interest in a tournament
app.post('/api/tournaments/:id/register-interest', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ message: 'Please sign in to register interest in this tournament.' });
  const tournId = req.params.id;
  const tournaments = getSiteContent('tournaments', []);
  const tourn = tournaments.find(t => t.id === tournId);
  if (!tourn) return res.status(404).json({ message: 'Tournament not found.' });

  user.tournamentInterests = user.tournamentInterests || {};
  if (user.tournamentInterests[tournId]) {
    delete user.tournamentInterests[tournId];
    writeUsers(users);
    return res.json({ ok: true, registered: false, message: `Interest removed for ${tourn.title}.` });
  }
  user.tournamentInterests[tournId] = { registeredAt: new Date().toISOString(), tournamentTitle: tourn.title };
  writeUsers(users);
  res.json({ ok: true, registered: true, message: `Success! Registered interest for ${tourn.title}.` });
});

// User: Get my tournament interests
app.get('/api/me/tournaments', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ authenticated: false });
  const interests = user.tournamentInterests || {};
  const tournaments = getSiteContent('tournaments', []);
  const myTournaments = tournaments
    .filter(t => interests[t.id])
    .map(t => ({ ...t, registeredAt: interests[t.id].registeredAt }));
  res.json({ ok: true, tournaments: myTournaments, interestIds: Object.keys(interests) });
});

// Public: Get single tournament with public participants
app.get('/api/site/tournaments/:id', (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const tourn = tournaments.find(t => t.id === req.params.id);
  if (!tourn) return res.status(404).json({ message: 'Tournament not found.' });

  const users = readUsers();
  const participants = [];
  for (const u of Object.values(users)) {
    if (u.tournamentInterests && u.tournamentInterests[tourn.id]) {
      participants.push({
        gamerTag: u.gamerTag || u.gamerName || 'Player',
        name: u.firstName || u.name || 'Competitor',
        rating: u.rating || 1000,
        registeredAt: u.tournamentInterests[tourn.id].registeredAt || null
      });
    }
  }
  participants.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));

  res.json({
    ok: true,
    tournament: tourn,
    participants,
    totalParticipants: participants.length
  });
});

// Admin: Get detailed tournament participants including email and status
app.get('/api/admin/tournaments/:id/participants', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const tourn = tournaments.find(t => t.id === req.params.id);
  if (!tourn) return res.status(404).json({ message: 'Tournament not found.' });

  const users = readUsers();
  const list = [];
  for (const u of Object.values(users)) {
    if (u.tournamentInterests && u.tournamentInterests[tourn.id]) {
      list.push({
        email: u.email,
        gamerTag: u.gamerTag || u.gamerName,
        name: u.firstName || u.name,
        rating: u.rating || 1000,
        wins: u.wins || 0,
        draws: u.draws || 0,
        losses: u.losses || 0,
        registeredAt: u.tournamentInterests[tourn.id].registeredAt || null
      });
    }
  }
  list.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
  res.json({ ok: true, tournament: tourn, participants: list });
});

// Admin: Remove player from tournament
app.delete('/api/admin/tournaments/:id/participants/:email', requireAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email).trim().toLowerCase();
  const users = readUsers();
  const user = users[email];
  if (!user || !user.tournamentInterests || !user.tournamentInterests[req.params.id]) {
    return res.status(404).json({ message: 'Player is not registered for this tournament.' });
  }
  delete user.tournamentInterests[req.params.id];
  writeUsers(users);
  res.json({ ok: true, message: `Removed ${user.gamerTag || email} from tournament.` });
});

const sendMatchReminders = async () => {
  if (!mailer) return;
  const matches = readMatches();
  const users = readUsers();
  const now = Date.now();
  let changed = false;
  for (const match of Object.values(matches)) {
    if (match.status !== 'accepted') continue;
    const scheduledTime = Date.parse(match.scheduledAt);
    if (now < scheduledTime - match.reminderMinutes * 60 * 1000 || now >= scheduledTime) continue;
    const [challenger, opponent] = [users[match.challengerEmail], users[match.opponentEmail]];
    if (!challenger || !opponent) continue;
    match.reminderSentTo ||= {};
    for (const [recipient, other] of [[challenger, opponent], [opponent, challenger]]) {
      if (match.reminderSentTo[recipient.email]) continue;
      const token = createToken();
      try {
        await sendEmail({
          to: recipient.email,
          subject: `Match reminder: ${other.gamerTag} vs ${recipient.gamerTag}`,
          html: emailLayout('Your match is coming up', `Your ${match.ranked ? 'ranked' : 'friendly'} match with ${other.gamerTag} is scheduled for ${formatMatchTime(scheduledTime, match.timeZone)} (${match.timeZone || 'UTC'}). Open your private link to review the details.`, privateMatchUrl(match.id, token), 'Open private match link', recipient.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
        });
        match.accessTokens ||= {};
        match.accessTokens[recipient.email] = { tokenHash: hashToken(token), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
        match.reminderSentTo[recipient.email] = true;
        changed = true;
      } catch (error) {
        console.error(`Match reminder email failed for match ${match.id}:`, error);
      }
    }
  }
  if (changed) writeMatches(matches);
};

const reminderTimer = setInterval(() => {
  sendMatchReminders().catch((error) => console.error('Match reminder check failed:', error));
}, 60 * 1000);
reminderTimer.unref();

app.listen(PORT, () => {
  console.log(`Tim eFootball League running at ${BASE_URL}`);
  console.log(mailer ? 'Email delivery: SMTP enabled' : 'Email delivery: disabled (configure SMTP settings in .env)');
});
