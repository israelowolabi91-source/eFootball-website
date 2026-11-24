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
const LEAGUE_CONFIG = require('./site-config');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const USERS_FILE = process.env.USERS_FILE || path.join(DATA_DIR, 'users.json');
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(DATA_DIR, 'efootball.sqlite');
const MATCHES_FILE = process.env.MATCHES_FILE || path.join(DATA_DIR, 'challenges.json');
const EVIDENCE_DIR = process.env.MATCH_EVIDENCE_DIR || path.join(DATA_DIR, 'match-evidence');
const PROFILE_PHOTO_DIR = process.env.PROFILE_PHOTO_DIR || path.join(DATA_DIR, 'player-photos');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const OWNER_REVIEW_TOKEN = String(process.env.OWNER_REVIEW_TOKEN || '');
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '').trim();
const SESSION_COOKIE = 'tim_league_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const scrypt = promisify(crypto.scrypt);
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const loginFailures = new Map();
const challengeRequestsByIp = new Map();
const challengeRequestsByUser = new Map();
const resendRequestsByMatch = new Map();

fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
if (!fs.existsSync(MATCHES_FILE)) {
  fs.writeFileSync(MATCHES_FILE, '{}', { mode: 0o600 });
}
fs.mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(PROFILE_PHOTO_DIR, { recursive: true, mode: 0o700 });

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
  CREATE TABLE IF NOT EXISTS admin_activity (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS player_reports (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    reporter_email TEXT NOT NULL COLLATE NOCASE,
    reported_email TEXT NOT NULL COLLATE NOCASE,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    UNIQUE (match_id, reporter_email)
  );
  CREATE TABLE IF NOT EXISTS match_chat_messages (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    sender_email TEXT NOT NULL COLLATE NOCASE,
    message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 500),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_match_chat_match_created
    ON match_chat_messages (match_id, created_at);
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
const selectPlayerReport = database.prepare('SELECT 1 FROM player_reports WHERE match_id = ? AND reporter_email = ?');
const selectMatchChatMessages = database.prepare(`
  SELECT id, sender_email, message, created_at
  FROM match_chat_messages
  WHERE match_id = ?
  ORDER BY created_at DESC, rowid DESC
  LIMIT 100
`);
const insertMatchChatMessage = database.prepare(`
  INSERT INTO match_chat_messages (id, match_id, sender_email, message, created_at)
  VALUES (@id, @matchId, @senderEmail, @message, @createdAt)
`);
const trimMatchChatMessages = database.prepare(`
  DELETE FROM match_chat_messages
  WHERE match_id = ?
    AND id NOT IN (
      SELECT id FROM match_chat_messages
      WHERE match_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 100
    )
`);
const deleteMatchChatMessages = database.prepare('DELETE FROM match_chat_messages WHERE match_id = ?');
const insertPlayerReport = database.prepare(`
  INSERT INTO player_reports (id, match_id, reporter_email, reported_email, reason, details, status, created_at)
  VALUES (@id, @matchId, @reporterEmail, @reportedEmail, @reason, @details, 'open', @createdAt)
`);
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
const readUsers = () => {
  const users = Object.fromEntries(selectUsers.all().map(({ email, profile_json }) => [email, JSON.parse(profile_json)]));
  const usersByEmail = new Map(Object.entries(users).map(([email, user]) => [
    String(user.email || email).trim().toLowerCase(),
    user
  ]));
  const records = new Map([...usersByEmail.keys()].map((email) => [email, { wins: 0, draws: 0, losses: 0, rankedMatches: 0 }]));
  const matches = JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));

  for (const match of Object.values(matches)) {
    const result = match.result;
    if (match.status !== 'approved' || match.ranked !== true ||
        !Number.isSafeInteger(result?.challengerScore) || !Number.isSafeInteger(result?.opponentScore)) continue;
    const challengerEmail = String(match.challengerEmail || '').trim().toLowerCase();
    const opponentEmail = String(match.opponentEmail || '').trim().toLowerCase();
    const challengerRecord = records.get(challengerEmail);
    const opponentRecord = records.get(opponentEmail);
    if (!challengerRecord || !opponentRecord) continue;

    challengerRecord.rankedMatches += 1;
    opponentRecord.rankedMatches += 1;
    if (result.challengerScore > result.opponentScore) {
      challengerRecord.wins += 1;
      opponentRecord.losses += 1;
    } else if (result.challengerScore < result.opponentScore) {
      challengerRecord.losses += 1;
      opponentRecord.wins += 1;
    } else {
      challengerRecord.draws += 1;
      opponentRecord.draws += 1;
    }
  }

  let changed = false;
  for (const [email, user] of usersByEmail) {
    const record = records.get(email);
    for (const field of ['wins', 'draws', 'losses', 'rankedMatches']) {
      if (user[field] !== record[field]) {
        user[field] = record[field];
        changed = true;
      }
    }
  }
  if (changed) saveUsers(users);
  return users;
};
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

// Start with an empty public site until an administrator publishes real content.
if (!getSiteContent('announcement')) {
  setSiteContent('announcement', {
    active: false,
    text: '',
    linkText: '',
    linkUrl: '',
    type: 'gold'
  });
}
if (!getSiteContent('tournaments')) setSiteContent('tournaments', []);
if (!getSiteContent('clubs')) setSiteContent('clubs', []);
if (!getSiteContent('bracket')) setSiteContent('bracket', null);

const demoContentMigration = database.prepare("SELECT 1 FROM app_migrations WHERE name = 'remove-seeded-demo-content-v1'").get();
if (!demoContentMigration) {
  const announcement = getSiteContent('announcement');
  if (announcement?.text === 'Season 04 League Cup registrations are live! Enter the 32-player knockout bracket.') {
    setSiteContent('announcement', { active: false, text: '', linkText: '', linkUrl: '', type: 'gold' });
  }
  const demoTournamentIds = new Set(['tourn-open-04', 'tourn-cup-04', 'tourn-rookie-04']);
  const tournaments = getSiteContent('tournaments', []);
  if (Array.isArray(tournaments) && tournaments.some((event) => demoTournamentIds.has(event.id))) {
    setSiteContent('tournaments', tournaments.filter((event) => !demoTournamentIds.has(event.id)));
  }
  const demoClubIds = new Set(['nova-fc', 'orbit-xi', 'falcon-city', 'tim-united', 'atlas-united', 'rovers-fc']);
  const clubs = getSiteContent('clubs', []);
  if (Array.isArray(clubs) && clubs.some((club) => demoClubIds.has(club.id))) {
    setSiteContent('clubs', clubs.filter((club) => !demoClubIds.has(club.id)));
  }
  const bracket = getSiteContent('bracket');
  if (bracket?.round1?.some((match) => ['NovaBlade (1)', 'Rex Orion (2)', 'BlueStrike (3)'].includes(match.p1))) {
    setSiteContent('bracket', null);
  }
  database.prepare("INSERT INTO app_migrations (name, completed_at) VALUES ('remove-seeded-demo-content-v1', ?)").run(new Date().toISOString());
}

const cupTitleMigration = database.prepare("SELECT 1 FROM app_migrations WHERE name = 'normalize-featured-cup-title-v1'").get();
if (!cupTitleMigration) {
  const tournaments = getSiteContent('tournaments', []);
  let changed = false;
  if (Array.isArray(tournaments)) {
    for (const event of tournaments) {
      if (event.featuredCup && event.title !== 'Tim League Cup 2026') {
        event.title = 'Tim League Cup 2026';
        changed = true;
      }
    }
  }
  if (changed) setSiteContent('tournaments', tournaments);
  database.prepare("INSERT INTO app_migrations (name, completed_at) VALUES ('normalize-featured-cup-title-v1', ?)").run(new Date().toISOString());
}

const starterTournamentMigration = database.prepare("SELECT 1 FROM app_migrations WHERE name = 'seed-community-events-v1'").get();
if (!starterTournamentMigration) {
  const existingTournaments = getSiteContent('tournaments', []);
  const starterEvents = [
      {
        id: 'community-cup-2026', title: 'Tim League Cup 2026', kicker: 'One bracket. One champion.', badge: 'CUP',
        format: '32-player single elimination', slots: '32 players', status: 'Registration Open',
        eventType: 'Knockout Cup', platform: 'Mobile, Console & PC', dates: 'Registration closes Dec 6 · Matches Dec 7–20, 2026',
        desc: 'The season showpiece is back. Win your way through the bracket and claim the League Cup champion feature on your profile.',
        rules: 'Register with a verified account. Play each round by the published deadline. Both players submit the final score and a match screenshot. Admins review disputed reports.',
        registrationOpen: true, featuredCup: true, published: true, prizePool: 'Champion profile feature',
        prizeDetails: 'The winner is featured on the League Cup page and in the season recap.', minElo: null, maxElo: null, entryLink: ''
      },
      {
        id: 'neon-night-blitz-2026', title: 'Neon Night Blitz', kicker: 'Fast fixtures. Bright lights.', badge: 'BLITZ',
        format: 'Four-round Swiss · one match per round', slots: '16 players', status: 'Registration Open',
        eventType: 'Swiss Sprint', platform: 'All platforms', dates: 'Dec 4–5, 2026',
        desc: 'A quick-fire evening tournament for players who want a full mini-season in one weekend. Pairings keep close records facing each other.',
        rules: 'Four scheduled rounds. Report every result with a screenshot in Match Centre. Standings use wins, then goal difference, then goals scored.',
        registrationOpen: true, featuredCup: false, published: true, prizePool: 'Neon Night winner feature',
        prizeDetails: 'Top finishers receive a public tournament recap mention.', minElo: null, maxElo: null, entryLink: ''
      },
      {
        id: 'underdog-uprising-2026', title: 'Underdog Uprising', kicker: 'The next name on the leaderboard.', badge: 'RISING',
        format: '16-player knockout', slots: '16 players', status: 'Coming Soon',
        eventType: 'Rising Players Cup', platform: 'All platforms', dates: 'Dec 12–19, 2026',
        desc: 'A level playing field for developing competitors. Build a run, upset a seed, and earn your first big tournament story.',
        rules: 'Open to players rated 1,399 Elo or below when registration closes. Verified profile and screenshot-backed result reports are required.',
        registrationOpen: false, featuredCup: false, published: true, prizePool: 'Breakthrough player feature',
        prizeDetails: 'The finalist with the biggest rating rise receives a season recap feature.', minElo: null, maxElo: 1399, entryLink: ''
      },
      {
        id: 'derby-day-ladder-2026', title: 'Derby Day: Rivalry Ladder', kicker: 'Choose a rival. Settle it on the pitch.', badge: 'DERBY',
        format: 'Open challenge ladder · 3 fixtures', slots: '24 players', status: 'Coming Soon',
        eventType: 'Rivalry Ladder', platform: 'All platforms', dates: 'Dec 19–27, 2026',
        desc: 'A social ladder built around head-to-head rivalries. Play three different opponents and climb the event table with every verified result.',
        rules: 'Each player receives up to three fixtures. Both opponents report the same score and submit a screenshot. Standings are settled by wins and goal difference.',
        registrationOpen: false, featuredCup: false, published: true, prizePool: 'Rivalry Week spotlight',
        prizeDetails: 'The ladder leader and closest rivalry are highlighted in the event recap.', minElo: null, maxElo: null, entryLink: ''
      },
      {
        id: 'golden-boot-gauntlet-2026', title: 'Golden Boot Gauntlet', kicker: 'Attack first. Keep the receipts.', badge: 'GOALS',
        format: 'Five-match scoring challenge', slots: 'Open entry', status: 'Coming Soon',
        eventType: 'Community Challenge', platform: 'All platforms', dates: 'Jan 2–10, 2027',
        desc: 'A friendly scoring race focused on goals, not Elo. Bring your sharpest attack and submit verified match results for the event board.',
        rules: 'Play up to five event fixtures. Only approved match reports count. Ties are broken by goals scored, then goal difference.',
        registrationOpen: false, featuredCup: false, published: true, prizePool: 'Golden Boot profile badge',
        prizeDetails: 'The top scorer is featured in the community recap.', minElo: null, maxElo: null, entryLink: ''
      }
    ];
  const mergedTournaments = Array.isArray(existingTournaments) ? [...existingTournaments] : [];
  starterEvents.forEach((event) => {
    if (event.featuredCup && mergedTournaments.some((existing) => existing.featuredCup)) return;
    if (!mergedTournaments.some((existing) => existing.id === event.id)) mergedTournaments.push(event);
  });
  setSiteContent('tournaments', mergedTournaments);
  database.prepare("INSERT INTO app_migrations (name, completed_at) VALUES ('seed-community-events-v1', ?)").run(new Date().toISOString());
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
    user.rating = LEAGUE_CONFIG.elo.initialRating;
    changed = true;
  }
  for (const field of ['wins', 'losses', 'draws', 'rankedMatches']) {
    if (!Number.isSafeInteger(user[field]) || user[field] < 0) {
      user[field] = 0;
      changed = true;
    }
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
    platform: user.platform || null,
    country: user.country || null,
    timeZone: user.timeZone || null,
    clubName: user.clubName || null,
    avatarUrl: user.avatar?.file ? `/api/players/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatar.updatedAt || '')}` : null,
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
const findUserEntry = (users, identifier) => {
  const value = String(identifier || '').trim();
  const normalizedEmail = value.toLowerCase();
  if (users[normalizedEmail]) return [normalizedEmail, users[normalizedEmail]];
  return Object.entries(users).find(([, user]) => user.id === value) || null;
};
const publicMatchProfile = (user) => ({
  id: user.id,
  gamerTag: user.gamerTag,
  platform: user.platform || null,
  country: user.country || null,
  clubName: user.clubName || null,
  avatarUrl: user.avatar?.file ? `/api/players/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatar.updatedAt || '')}` : null,
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
const publicMatch = (match, currentEmail, users, canReport = false) => {
  const { challenger, opponent } = matchParticipants(match, users);
  if (!challenger || !opponent) return null;
  const isChallenger = currentEmail === match.challengerEmail;
  return {
    id: match.id,
    challenger: publicMatchProfile(challenger),
    opponent: publicMatchProfile(opponent),
    isChallenger,
    role: isChallenger ? 'challenger' : 'opponent',
    canReport,
    ranked: match.ranked,
    scheduledAt: match.scheduledAt,
    timeZone: match.timeZone || 'UTC',
    streamUrl: match.streamUrl || null,
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
      approvedAt: match.result.approvedAt || null,
      farmCapApplied: Boolean(match.result.farmCapApplied)
    } : null,
    reminderSent: Boolean(match.reminderSent),
    emailStatus: match.emailStatus || {},
    playerReportSubmitted: Boolean(currentEmail && selectPlayerReport.get(match.id, currentEmail)),
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
const matchParticipantEmailForRequest = (req, match, users) => {
  const sessionUser = findSessionUser(req, users);
  if (sessionUser && [match?.challengerEmail, match?.opponentEmail].includes(sessionUser.email)) {
    return sessionUser.email;
  }
  return matchParticipantEmail(req, match);
};
const publicStreamHosts = [
  'youtube.com', 'youtu.be', 'twitch.tv', 'kick.com',
  'tiktok.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com'
];
const normalizePublicStreamUrl = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Enter a public HTTPS stream link.');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) throw new Error('Stream links must be 500 characters or fewer.');
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid stream link.');
  }
  const hostname = url.hostname.toLowerCase();
  const allowedHost = publicStreamHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || url.username || url.password || !allowedHost) {
    throw new Error('Use an HTTPS link from YouTube, Twitch, Kick, TikTok, Instagram, Facebook, or X.');
  }
  return url.toString();
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
const recordAdminActivity = (req, action, entity, entityId, summary) => {
  const actor = findSessionUser(req, readUsers())?.email || 'Admin key';
  database.prepare(`INSERT INTO admin_activity (id, actor, action, entity, entity_id, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), actor, action, entity, String(entityId || ''), String(summary || '').slice(0, 240), new Date().toISOString());
  database.exec(`DELETE FROM admin_activity WHERE id NOT IN (SELECT id FROM admin_activity ORDER BY created_at DESC LIMIT 500)`);
};

const ownerReviewAuthorized = (req) => isAdminRequest(req);
const safeEmail = (value) => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
const isPublicRankingPlayer = (user) => {
  const role = String(user.role || '').trim().toLowerCase();
  const accountType = String(user.accountType || '').trim().toLowerCase();
  const isDemoProfile = user.demo === true || user.isDemo === true || user.testAccount === true ||
    user.isTestAccount === true || ['demo', 'sample', 'test'].includes(role) ||
    ['demo', 'sample', 'test'].includes(accountType);
  return user.verified && safeEmail(String(user.email || '')) && user.gamerTag &&
    role !== 'admin' && !isDemoProfile;
};
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
const getPublicClubs = (users) => {
  const groupedClubs = new Map();
  for (const user of Object.values(users)) {
    const name = String(user.clubName || '').trim().slice(0, 60);
    if (!user.verified || !user.gamerTag || !name) continue;
    const key = name.toLocaleLowerCase();
    const club = groupedClubs.get(key) || {
      id: crypto.createHash('sha256').update(key).digest('hex').slice(0, 12),
      name,
      members: 0,
      totalRating: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      players: []
    };
    club.members += 1;
    club.totalRating += Number(user.rating) || 1000;
    club.wins += Number(user.wins) || 0;
    club.draws += Number(user.draws) || 0;
    club.losses += Number(user.losses) || 0;
    club.players.push(user.gamerTag);
    groupedClubs.set(key, club);
  }
  return [...groupedClubs.values()]
    .map((club) => ({
      id: club.id || 'club',
      name: club.name,
      members: club.members,
      averageRating: Math.round(club.totalRating / club.members),
      wins: club.wins,
      draws: club.draws,
      losses: club.losses,
      record: `${club.wins}–${club.draws}–${club.losses}`,
      players: club.players.sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => b.averageRating - a.averageRating || a.name.localeCompare(b.name))
    .map((club, index) => ({ rank: index + 1, ...club }));
};
const formatMatchTime = (value, timeZone) => new Date(value).toLocaleString('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: normalizedTimeZone(timeZone) || 'UTC'
});
const privateMatchUrl = (matchId, token) =>
  `${BASE_URL}/matches.html?match=${encodeURIComponent(matchId)}&access=${encodeURIComponent(token)}#challenges`;
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

const smtpReady = Boolean(process.env.BREVO_API_KEY);
const mailer = smtpReady
  ? {
      sendMail: async ({ from, to, subject, html }) => {
        const senderEmail =
          process.env.BREVO_SENDER_EMAIL ||
          String(from || '').replace(/^.*<|>.*$/g, '').trim();
        const recipients = (Array.isArray(to) ? to : [to]).map((email) => ({ email }));
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
            accept: 'application/json'
          },
          body: JSON.stringify({
            sender: { name: 'Tim eFootball League', email: senderEmail },
            to: recipients,
            subject,
            htmlContent: html
          }),
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
          throw new Error(`Brevo error ${response.status}: ${await response.text()}`);
        }
        return response.json();
      }
    }
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
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (!password || password.length < 8) return 'Password must contain at least 8 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be 72 bytes or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must include at least one letter and one number.';
  return null;
};

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-in requests from this network. Please try again in 15 minutes.' }
});
const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: "If that email has an account, we've sent a link." }
});
const verificationResendRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: true, message: 'If that email needs verification, a link has been sent.' }
});
const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many account creation attempts. Please try again in an hour.' }
});
const playerReportRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'You have reached the daily limit for player reports. Contact an administrator if this is urgent.' }
});
const matchChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You are sending messages too quickly. Try again in a few minutes.' }
});
const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many administrator sign-in attempts. Try again in 15 minutes.' }
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  const sendJson = res.json.bind(res);
  res.json = (value) => {
    if (!req.path.startsWith('/api/')) return sendJson(value);
    const redact = (item) => {
      if (typeof item === 'string') {
        return item.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
      }
      if (Array.isArray(item)) return item.map(redact);
      if (!item || typeof item !== 'object') return item;
      return Object.fromEntries(Object.entries(item)
        .filter(([key]) => {
          const normalizedKey = key.toLowerCase();
          return normalizedKey !== 'email' && normalizedKey.endsWith('email') === false &&
            normalizedKey !== 'emailaddress' && normalizedKey !== 'emails';
        })
        .map(([key, child]) => [key, redact(child)]));
    };
    return sendJson(redact(value));
  };

  const isUnsafeApiRequest = req.path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (isUnsafeApiRequest) {
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host.toLowerCase() !== String(req.get('host') || '').toLowerCase()) {
          return res.status(403).json({ message: 'Cross-origin requests are not allowed.' });
        }
      } catch {
        return res.status(403).json({ message: 'A valid same-origin request is required.' });
      }
    } else if (readCookie(req, SESSION_COOKIE)) {
      return res.status(403).json({ message: 'A same-origin request is required for signed-in actions.' });
    }
    if (req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ message: 'Cross-origin requests are not allowed.' });
    }
  }
  next();
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
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});
app.get('/', (req, res) => {
	const signedInUser = findSessionUser(req, readUsers());
	res.redirect(302, signedInUser ? '/index.html' : '/login.html');
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
app.get(['/admin', '/admin.html'], (req, res, next) => {
  const sessionUser = findSessionUser(req, readUsers());
  const isOwner = Boolean(sessionUser && OWNER_EMAIL && sessionUser.email.toLowerCase() === OWNER_EMAIL);
  if (!sessionUser || (sessionUser.role !== 'admin' && !isOwner)) return res.sendStatus(404);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(ROOT, 'admin.html'), (error) => {
    if (error) next(error);
  });
});
app.use((req, res, next) => {
  const normalized = path.posix.normalize(req.path);
  const publicHtml = new Set([
    '/index.html', '/tournaments.html', '/rankings.html', '/play.html',
    '/matches.html', '/cup.html', '/login.html', '/signup.html',
    '/profile.html', '/privacy.html', '/terms.html', '/records.html'
  ]);
  const publicAssets = new Set([
    '/style.css', '/script.js', '/site-config.js', '/admin.js', '/admin.css', '/member-experience.css',
    '/sw.js', '/favicon.png', '/manifest.webmanifest'
  ]);
  const publicFile = publicHtml.has(normalized) ||
    publicAssets.has(normalized) ||
    /^\/images\/[\w./-]+\.(?:png|jpg|jpeg|webp|svg|ico)$/.test(normalized);
  if (!['GET', 'HEAD'].includes(req.method)) return next();
  const authLandingPages = new Set(['/login.html', '/signup.html', '/privacy.html', '/terms.html']);
  if (publicHtml.has(normalized) && !authLandingPages.has(normalized) && !findSessionUser(req, readUsers())) {
    const requestedPath = req.originalUrl.length <= 2048 ? req.originalUrl : '/index.html';
    return res.redirect(302, `/login.html?next=${encodeURIComponent(requestedPath)}`);
  }
  if (publicFile) return next();
  if (normalized.startsWith('/api/')) return next();
  return res.sendStatus(404);
});
app.use(express.static(ROOT, {
  dotfiles: 'deny',
  index: false,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (/\.(html|json|webmanifest)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  }
}));

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
    const platform = String(req.body.platform || '');
    const country = String(req.body.country || '').trim();
    const timeZone = normalizedTimeZone(req.body.timeZone);
    if (!/^[\p{L}\p{N}_. -]{3,32}$/u.test(gamerTag)) return res.status(400).json({ message: 'Use letters, numbers, spaces, dots, underscores, or hyphens for your gamer tag.' });
    if (!['Mobile', 'Console', 'PC'].includes(platform)) return res.status(400).json({ message: 'Choose a supported eFootball platform.' });
    if (country.length < 2 || country.length > 60) return res.status(400).json({ message: 'Enter your country.' });
    if (!timeZone) return res.status(400).json({ message: 'Enter a valid time zone.' });
    if (req.body.termsAccepted !== true) return res.status(400).json({ message: 'Accept the Terms and Privacy Policy to create an account.' });
    const users = readUsers();
    if (users[normalizedEmail]) return res.status(409).json({ message: 'An account already exists for that email.' });
    if (Object.values(users).some((candidate) => String(candidate.gamerTag || '').toLocaleLowerCase() === gamerTag.toLocaleLowerCase())) {
      return res.status(409).json({ message: 'That gamer tag is already in use.' });
    }

    const token = createToken();
    const user = {
      name: firstName,
      firstName,
      gamerTag,
      gamerName: gamerTag,
      platform,
      country,
      timeZone,
      termsAcceptedAt: new Date().toISOString(),
      email: normalizedEmail,
      id: crypto.randomUUID(),
      rating: LEAGUE_CONFIG.elo.initialRating,
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
      return res.status(503).json({ message: 'We could not send a verification email. Try again later.' });
    }

    res.status(201).json({
      ok: true,
      requiresVerification: true,
      verified: false,
      message: 'Account created. Check your email and click the verification link before signing in.'
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
    if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    const accountKey = hashToken(email);
    const attempt = loginFailures.get(accountKey);
    if (attempt?.lockedUntil > Date.now()) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (attempt?.lockedUntil && attempt.lockedUntil <= Date.now()) loginFailures.delete(accountKey);
    if (password.length > 256) return res.status(401).json({ message: 'Email or password is incorrect.' });
    const user = readUsers()[email];

    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      const failures = (loginFailures.get(accountKey)?.failures || 0) + 1;
      loginFailures.set(accountKey, {
        failures,
        lockedUntil: failures >= LOGIN_FAILURE_LIMIT ? Date.now() + LOGIN_LOCKOUT_MS : 0
      });
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    loginFailures.delete(accountKey);

    // Require email verification for new accounts (owner/admin accounts stay pre-verified)
    const isOwner = Boolean(OWNER_EMAIL && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase());
    if (!user.verified && !isOwner && user.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        verified: false,
        message: 'Please verify your email address before signing in. Check your inbox or request a new verification link.'
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
    gamerName: user.gamerTag || user.gamerName,
    gamerTag: user.gamerTag || user.gamerName,
    avatarUrl: publicProfile(user).avatarUrl,
    platform: user.platform || null,
    country: user.country || null,
    timeZone: user.timeZone || null,
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
        opponent: opponent ? { gamerTag: opponent.gamerTag, rating: opponent.rating, avatarUrl: publicMatchProfile(opponent).avatarUrl } : { gamerTag: 'Unknown', rating: null, avatarUrl: null },
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
  const allPlayers = Object.values(users).filter(isPublicRankingPlayer);
  allPlayers.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
  const rank = allPlayers.findIndex((u) => u.email === user.email) + 1;
  const total = allPlayers.length;
  res.json({ ok: true, rank, total, rating: user.rating || 1000, percentile: total > 1 ? Math.round((1 - (rank - 1) / (total - 1)) * 100) : 100 });
});

app.post('/api/records', (req, res) => {
  res.setHeader('Allow', 'GET');
  res.status(410).json({ message: 'Player records are calculated from approved match results and can no longer be edited.' });
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

app.post('/api/auth/resend-verification', verificationResendRateLimit, async (req, res) => {
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
    console.error('Verification email delivery failed:', error);
    return res.json({ ok: true });
  }
  writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/auth/password-reset', passwordResetRateLimit, async (req, res) => {
  const genericResponse = { ok: true, message: "If that email has an account, we've sent a link." };
  const email = String(req.body.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json(genericResponse);
  const users = readUsers();
  const user = users[email];
  if (!user || !user.verified) return res.json(genericResponse);

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
    console.error('Password reset email delivery failed:', error);
    return res.json(genericResponse);
  }
  writeUsers(users);
  res.json(genericResponse);
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
    if (!googleClient || !idToken) return res.status(503).json({ message: 'Verified Google sign-in is not configured.' });
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true || !payload.sub) {
      return res.status(401).json({ message: 'Google account details could not be verified.' });
    }
    const email = payload.email.trim().toLowerCase();
    const firstName = payload.given_name || payload.name?.split(' ')[0] || 'Player';
    const gamerTag = payload.name || email.split('@')[0] || 'GooglePlayer';
    const googleSub = payload.sub;

    const users = readUsers();
    if (!users[email]) {
      users[email] = {
        id: crypto.randomUUID(),
        firstName,
        name: firstName,
        gamerTag,
        gamerName: gamerTag,
        email,
        rating: LEAGUE_CONFIG.elo.initialRating,
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

const saveProfilePhoto = (user, dataUrl) => {
  if (typeof dataUrl !== 'string') throw new Error('Choose a PNG, JPEG, or WebP profile photo.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('Use a PNG, JPEG, or WebP profile photo.');
  const contents = Buffer.from(match[2], 'base64');
  if (!contents.length || contents.length > 2 * 1024 * 1024) throw new Error('Profile photos must be 2 MB or smaller.');
  const imageType = match[1];
  const validBytes = imageType === 'png'
    ? contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : imageType === 'jpeg'
      ? contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff
      : contents.length >= 12 && contents.toString('ascii', 0, 4) === 'RIFF' && contents.toString('ascii', 8, 12) === 'WEBP';
  if (!validBytes) throw new Error('The photo contents do not match the selected image type.');
  const extension = imageType === 'jpeg' ? 'jpg' : imageType;
  const file = `photo-${crypto.randomUUID()}.${extension}`;
  if (user.avatar?.file && /^photo-[\w-]+\.(png|jpg|webp)$/.test(user.avatar.file)) {
    fs.rmSync(path.join(PROFILE_PHOTO_DIR, path.basename(user.avatar.file)), { force: true });
  }
  fs.writeFileSync(path.join(PROFILE_PHOTO_DIR, file), contents, { mode: 0o600 });
  return { file, contentType: `image/${imageType}`, updatedAt: new Date().toISOString() };
};

app.get('/api/players/:id/avatar', (req, res) => {
  const user = Object.values(readUsers()).find((candidate) => candidate.id === req.params.id && candidate.verified);
  const avatar = user?.avatar;
  if (!avatar || !/^photo-[\w-]+\.(png|jpg|webp)$/.test(avatar.file)) {
    return res.sendStatus(404);
  }
  res.setHeader('Content-Type', avatar.contentType || (avatar.file.endsWith('.jpg') ? 'image/jpeg' : `image/${path.extname(avatar.file).slice(1)}`));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(path.join(PROFILE_PHOTO_DIR, avatar.file));
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
  if (Object.hasOwn(req.body, 'platform')) {
    const platform = String(req.body.platform || '').trim();
    if (platform && !['Mobile', 'Console', 'PC'].includes(platform)) return res.status(400).json({ message: 'Choose Mobile, Console, or PC as your platform.' });
    user.platform = platform || null;
  }
  if (Object.hasOwn(req.body, 'country')) {
    const country = String(req.body.country || '').trim();
    if (country.length > 60) return res.status(400).json({ message: 'Country must be 60 characters or fewer.' });
    user.country = country || null;
  }
  if (Object.hasOwn(req.body, 'timeZone')) {
    const timeZone = String(req.body.timeZone || '').trim();
    if (timeZone && !normalizedTimeZone(timeZone)) return res.status(400).json({ message: 'Enter a valid time zone, such as Africa/Lagos.' });
    user.timeZone = timeZone || null;
  }
  if (Object.hasOwn(req.body, 'avatarData')) {
    if (req.body.avatarData === null) {
      if (user.avatar?.file && /^photo-[\w-]+\.(png|jpg|webp)$/.test(user.avatar.file)) {
        fs.rmSync(path.join(PROFILE_PHOTO_DIR, path.basename(user.avatar.file)), { force: true });
      }
      delete user.avatar;
    } else {
      try {
        user.avatar = saveProfilePhoto(user, req.body.avatarData);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }
  }
  users[user.email] = user;
  writeUsers(users);
  res.json({ profile: publicProfile(user) });
});

app.get('/api/players', (req, res) => {
  const query = String(req.query.search || '').trim().toLocaleLowerCase();
  if (query.length > 50) return res.status(400).json({ message: 'Search text is too long.' });
  const users = readUsers();
  const players = Object.values(users)
    .filter((candidate) => isPublicRankingPlayer(candidate) && String(candidate.gamerTag || '').toLocaleLowerCase().includes(query))
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
  const players = Object.values(users).filter(isPublicRankingPlayer);
  let changed = false;
  for (const player of players) changed = ensureMatchProfile(player) || changed;
  if (changed) writeUsers(users);
  players.sort((a, b) => b.rating - a.rating || a.gamerTag.localeCompare(b.gamerTag));
  res.json({
    players: players.map((player, index) => ({ rank: index + 1, ...publicMatchProfile(player) })),
    updatedAt: new Date().toISOString(),
    ratingSystem: `Elo, K=${LEAGUE_CONFIG.elo.rankedKFactor}; new profiles start at ${LEAGUE_CONFIG.elo.initialRating}.`
  });
});

app.get('/api/site/dashboard', (req, res) => {
  const users = readUsers();
  const signedInUser = findSessionUser(req, users);
  let userRecordsChanged = false;
  const publicPlayers = Object.values(users)
    .filter(isPublicRankingPlayer)
    .map((user) => {
      userRecordsChanged = ensureMatchProfile(user) || userRecordsChanged;
      return user;
    })
    .sort((a, b) => b.rating - a.rating || a.gamerTag.localeCompare(b.gamerTag));
  const matches = Object.values(readMatches());
  const approvedMatches = matches
    .filter((match) => match.status === 'approved' && match.result && Number.isSafeInteger(match.result.challengerScore) && Number.isSafeInteger(match.result.opponentScore))
    .sort((a, b) => Date.parse(b.result.approvedAt || b.createdAt) - Date.parse(a.result.approvedAt || a.createdAt));
  const tournaments = getSiteContent('tournaments', []);
  const events = Array.isArray(tournaments) ? tournaments : [];
  const activeEvents = events.filter((event) => {
    const status = String(event.status || '');
    return event.published !== false && !/closed|completed|cancelled/i.test(status) &&
      (event.registrationOpen === true || /open|active|progress/i.test(status));
  });
  const recentResults = approvedMatches.slice(0, 50).map((match) => {
    const challenger = users[match.challengerEmail];
    const opponent = users[match.opponentEmail];
    if (!challenger || !opponent) return null;
    return {
      id: match.id,
      challenger: challenger.gamerTag,
      opponent: opponent.gamerTag,
      challengerAvatarUrl: publicMatchProfile(challenger).avatarUrl,
      opponentAvatarUrl: publicMatchProfile(opponent).avatarUrl,
      challengerScore: match.result.challengerScore,
      opponentScore: match.result.opponentScore,
      approvedAt: match.result.approvedAt || match.createdAt,
      competition: match.competition || 'open',
      ranked: Boolean(match.ranked),
      ratingChanges: match.result.ratingChanges || null
    };
  }).filter(Boolean);

  let personal = null;
  if (signedInUser) {
    const userMatches = matches
      .filter((match) => match.challengerEmail === signedInUser.email || match.opponentEmail === signedInUser.email)
      .sort((a, b) => Date.parse(b.scheduledAt || b.createdAt) - Date.parse(a.scheduledAt || a.createdAt));
    const rank = publicPlayers.findIndex((player) => player.email === signedInUser.email) + 1;
    const recentPersonalResults = userMatches
      .filter((match) => match.status === 'approved' && match.ranked && match.result)
      .slice(0, 10)
      .map((match) => {
        const isChallenger = match.challengerEmail === signedInUser.email;
        const opponent = users[isChallenger ? match.opponentEmail : match.challengerEmail];
        const myScore = isChallenger ? match.result.challengerScore : match.result.opponentScore;
        const opponentScore = isChallenger ? match.result.opponentScore : match.result.challengerScore;
        return {
          id: match.id,
          opponent: opponent?.gamerTag || 'Opponent',
          myScore,
          opponentScore,
          approvedAt: match.result.approvedAt || match.createdAt,
          ratingChange: match.result.ratingChanges
            ? match.result.ratingChanges[isChallenger ? 'challenger' : 'opponent']
            : null,
          outcome: myScore > opponentScore ? 'win' : myScore < opponentScore ? 'loss' : 'draw'
        };
      });
    const streakResult = recentPersonalResults[0]?.outcome;
    const streak = streakResult
      ? recentPersonalResults.filter((result) => result.outcome === streakResult).length
      : 0;
    const nextMatch = userMatches.find((match) => (
      ['accepted', 'pending', 'awaiting-opponent'].includes(match.status) &&
      Date.parse(match.scheduledAt || '') >= Date.now()
    ));
    const nextOpponent = nextMatch && users[
      nextMatch.challengerEmail === signedInUser.email ? nextMatch.opponentEmail : nextMatch.challengerEmail
    ];
    personal = {
      gamerTag: signedInUser.gamerTag,
      rating: signedInUser.rating,
      wins: signedInUser.wins,
      draws: signedInUser.draws,
      losses: signedInUser.losses,
      rank: rank || null,
      rankedPlayers: publicPlayers.length,
      streak: streak ? { outcome: streakResult, count: streak } : null,
      nextMatch: nextMatch ? {
        id: nextMatch.id,
        opponent: nextOpponent?.gamerTag || 'Opponent',
        scheduledAt: nextMatch.scheduledAt,
        competition: nextMatch.competition || 'open',
        status: nextMatch.status
      } : null,
      recentResults: recentPersonalResults.slice(0, 3)
    };
  }
  if (userRecordsChanged) writeUsers(users);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    ok: true,
    stats: {
      players: publicPlayers.length,
      approvedMatches: approvedMatches.length,
      activeEvents: activeEvents.length,
      clubs: getPublicClubs(users).length
    },
    clubs: getPublicClubs(users),
    topPlayers: publicPlayers.slice(0, 4).map((player, index) => ({
      rank: index + 1,
      ...publicMatchProfile(player)
    })),
    recentResults,
    events: activeEvents.slice(0, 3).map((event) => ({
      id: event.id,
      title: event.title,
      format: event.format,
      status: event.status,
      eventType: event.eventType || '',
      platform: event.platform || '',
      dates: event.dates,
      desc: event.desc,
      slots: event.slots,
      prizePool: event.prizePool || '',
      prizeDetails: event.prizeDetails || '',
      registrationOpen: Boolean(event.registrationOpen)
    })),
    announcement: getSiteContent('announcement', { active: false }),
    personal
  });
});

// Get all active matches for the logged-in session user
app.get('/api/matches/active', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ authenticated: false, matches: [] });

  res.setHeader('Cache-Control', 'private, no-store');
  const allMatches = readMatches();
  const myMatches = Object.values(allMatches)
    .filter((m) => (m.challengerEmail === user.email || m.opponentEmail === user.email) && m.status !== 'cancelled')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 30)
    .map((m) => publicMatch(m, user.email, users, true))
    .filter(Boolean);

  res.json({ ok: true, matches: myMatches });
});

app.get('/api/matches/:id', (req, res) => {
  const match = readMatches()[req.params.id];
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  const email = matchParticipantEmailForRequest(req, match, users);

  if (!match || !email) return res.status(401).json({ message: 'Open the private match link sent to your profile email or sign in to view this match.' });
  res.setHeader('Cache-Control', 'private, no-store');
  const serialized = publicMatch(match, email, users, Boolean(sessionUser && sessionUser.email === email));
  if (!serialized) return res.status(404).json({ message: 'Match players could not be found.' });
  res.json({ match: serialized });
});

app.get('/api/matches/:id/chat', (req, res) => {
  const match = readMatches()[req.params.id];
  if (!match) return res.status(404).json({ message: 'Match not found.' });
  const users = readUsers();
  const email = matchParticipantEmailForRequest(req, match, users);
  if (!email) return res.status(401).json({ message: 'Only the players in this match can view its private chat.' });

  res.setHeader('Cache-Control', 'private, no-store');
  const messages = selectMatchChatMessages.all(match.id).reverse().map((entry) => ({
    id: entry.id,
    senderGamerTag: users[entry.sender_email]?.gamerTag || 'Player',
    isYou: entry.sender_email.toLowerCase() === email.toLowerCase(),
    message: entry.message,
    createdAt: entry.created_at
  }));
  res.json({ ok: true, messages });
});

app.post('/api/matches/:id/chat', matchChatRateLimit, (req, res) => {
  const match = readMatches()[req.params.id];
  if (!match) return res.status(404).json({ message: 'Match not found.' });
  const users = readUsers();
  const email = matchParticipantEmailForRequest(req, match, users);
  if (!email) return res.status(401).json({ message: 'Only the players in this match can send private chat messages.' });
  if (['approved', 'declined', 'cancelled'].includes(match.status)) {
    return res.status(409).json({ message: 'Chat is closed for this match.' });
  }
  if (typeof req.body?.message !== 'string') return res.status(400).json({ message: 'Enter a chat message.' });
  const message = req.body.message.trim();
  if (!message || message.length > 500) {
    return res.status(400).json({ message: 'Messages must contain 1 to 500 characters.' });
  }
  if (!users[email]) return res.status(404).json({ message: 'Your player profile is unavailable.' });

  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  insertMatchChatMessage.run({ id, matchId: match.id, senderEmail: email, message, createdAt });
  trimMatchChatMessages.run(match.id, match.id);
  res.status(201).json({
    ok: true,
    message: {
      id,
      senderGamerTag: users[email].gamerTag || 'Player',
      isYou: true,
      message,
      createdAt
    }
  });
});

app.put('/api/matches/:id/stream', (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  if (!match) return res.status(404).json({ message: 'Match not found.' });
  const users = readUsers();
  const email = matchParticipantEmailForRequest(req, match, users);
  if (!email) return res.status(401).json({ message: 'Only the players in this match can update its public stream link.' });
  if (['declined', 'cancelled'].includes(match.status)) {
    return res.status(409).json({ message: 'A stream link cannot be added to a declined or cancelled match.' });
  }

  let streamUrl;
  try {
    streamUrl = normalizePublicStreamUrl(req.body?.streamUrl);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  match.streamUrl = streamUrl;
  match.streamUpdatedAt = streamUrl ? new Date().toISOString() : null;
  writeMatches(matches);
  res.json({
    ok: true,
    streamUrl,
    message: streamUrl ? 'Public stream link saved.' : 'Public stream link removed.'
  });
});

app.post('/api/matches', async (req, res) => {
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  if (!sessionUser) {
    return res.status(401).json({ message: 'You must sign in to create a match challenge.' });
  }
  if (!sessionUser.verified) {
    return res.status(403).json({ message: 'Please verify your email address before creating challenges.' });
  }

  // Enforce server-side identity: challenger is always the authenticated user
  const challenger = sessionUser;
  const opponentId = String(req.body.opponentId || '');
  const scheduledAt = String(req.body.scheduledAt || '');
  const timeZone = normalizedTimeZone(req.body.timeZone);
  const ranked = req.body.ranked === true;
  const reminderMinutes = Number(req.body.reminderMinutes);
  const scheduledTime = Date.parse(scheduledAt);
  let streamUrl;
  try {
    streamUrl = normalizePublicStreamUrl(req.body?.streamUrl);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const allowedReminders = new Set([15, 30, 60, 1440]);
  if (!timeZone) return res.status(400).json({ message: 'A valid local time zone is required to schedule the match.' });
  if (!opponentId || !Number.isFinite(scheduledTime) || scheduledTime < Date.now() + 5 * 60 * 1000 || scheduledTime > Date.now() + 60 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ message: 'Choose a match time at least 5 minutes from now and within the next 60 days.' });
  }
  if (!allowedReminders.has(reminderMinutes)) return res.status(400).json({ message: 'Choose a reminder between 15 minutes and 24 hours before kick-off.' });

  const opponent = Object.values(users).find((candidate) => candidate.id === opponentId && candidate.verified && safeEmail(String(candidate.email || '')));
  if (!opponent) return res.status(404).json({ message: 'That player profile with a linked email address could not be found.' });
  if (opponent.email.toLowerCase() === challenger.email.toLowerCase() || opponent.id === challenger.id) {
    return res.status(400).json({ message: 'You cannot challenge your own profile.' });
  }

  const now = Date.now();
  // 1. IP rate limiting (max 5 invitations per hour)
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const recentIpRequests = (challengeRequestsByIp.get(ip) || []).filter((timestamp) => timestamp > now - 60 * 60 * 1000);
  if (recentIpRequests.length >= 5) return res.status(429).json({ message: 'Too many invitations were sent from this connection. Try again later.' });

  // 2. User account rate limiting (max 5 invitations per hour per account)
  const userKey = challenger.email.toLowerCase();
  const recentUserRequests = (challengeRequestsByUser.get(userKey) || []).filter((timestamp) => timestamp > now - 60 * 60 * 1000);
  if (recentUserRequests.length >= 5) return res.status(429).json({ message: 'You have reached the limit of 5 match challenges per hour. Please wait a bit before sending more.' });

  recentIpRequests.push(now);
  challengeRequestsByIp.set(ip, recentIpRequests);
  recentUserRequests.push(now);
  challengeRequestsByUser.set(userKey, recentUserRequests);

  const matches = readMatches();
  const duplicate = Object.values(matches).some((match) => (
    match.status === 'pending' &&
    ((match.challengerEmail === challenger.email && match.opponentEmail === opponent.email) ||
      (match.challengerEmail === opponent.email && match.opponentEmail === challenger.email))
  ));
  if (duplicate) return res.status(409).json({ message: 'There is already a pending invitation between you and this player.' });
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
    streamUrl,
    streamUpdatedAt: streamUrl ? new Date().toISOString() : null,
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
        html: emailLayout(title, message, privateMatchUrl(id, token), 'Open private match link', recipient.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
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
    match: publicMatch(match, challenger.email, users, true),
    emailSent: match.emailStatus.challenger === 'sent' && match.emailStatus.opponent === 'sent',
    message: match.emailStatus.challenger === 'sent' && match.emailStatus.opponent === 'sent'
      ? 'Private match links sent to both players’ profile emails.'
      : 'The match was saved, but one or both emails could not be delivered. Check server email settings before trying again.'
  });
});

app.post('/api/matches/:id/respond', async (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  const email = sessionUser?.email;
  if (!match || !email) return res.status(401).json({ message: 'Sign in with your verified account to respond to this invitation.' });
  if (email !== match.opponentEmail) return res.status(403).json({ message: 'Only the invited opponent can respond to this invitation.' });
  const action = String(req.body.action || '');
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ message: 'Choose accept or decline.' });
  if (match.status !== 'pending') return res.status(409).json({ message: 'This invitation is no longer awaiting a response.' });
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
      html: emailLayout(`Invitation ${action === 'accept' ? 'accepted' : 'declined'}`, `${opponent.gamerTag} ${action === 'accept' ? 'accepted your match invitation.' : 'declined your match invitation.'}${action === 'accept' ? ` The match is scheduled for ${formatMatchTime(match.scheduledAt, match.timeZone)} (${match.timeZone || 'UTC'}).` : ''}`, privateMatchUrl(match.id, challengerToken), 'Open private match link', challenger.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
    });
    match.accessTokens[challenger.email] = { tokenHash: hashToken(challengerToken), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
    match.emailStatus.challenger = 'sent';
    writeMatches(matches);
  } catch (error) {
    console.error('Match response email failed:', error);
    emailSent = false;
  }
  res.json({ ok: true, status: match.status, emailSent, match: publicMatch(match, email, users, true) });
});

app.post('/api/matches/:id/resend-invitation', async (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  const email = sessionUser?.email;
  if (!match || !email) return res.status(401).json({ message: 'Sign in with your verified account to resend an invitation.' });
  if (match.challengerEmail !== email || match.status !== 'pending') return res.status(404).json({ message: 'Pending invitation not found.' });

  // Anti-spam protection: max 1 resend every 5 minutes per match
  const lastResend = resendRequestsByMatch.get(match.id) || 0;
  if (Date.now() - lastResend < 5 * 60 * 1000) {
    const waitMins = Math.ceil((5 * 60 * 1000 - (Date.now() - lastResend)) / 60000);
    return res.status(429).json({ message: `Please wait ${waitMins} minute(s) before resending another invitation reminder.` });
  }
  resendRequestsByMatch.set(match.id, Date.now());

  const challenger = users[match.challengerEmail];
  const opponent = users[match.opponentEmail];
  const opponentToken = createToken();
  try {
    await sendEmail({
      to: opponent.email,
      subject: `${challenger.gamerTag} sent you an eFootball match invitation`,
      html: emailLayout('Match invitation reminder', `${challenger.gamerTag} is waiting for your response to a ${match.ranked ? 'ranked' : 'friendly'} match invitation.`, privateMatchUrl(match.id, opponentToken), 'View private invitation', opponent.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
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

// Helper to count ranked matches between two players in the last 24 hours (anti-farming protection)
const countRecentRankedMatches = (allMatches, emailA, emailB, excludeMatchId = null, windowMs = 24 * 60 * 60 * 1000) => {
  const cutoff = Date.now() - windowMs;
  return Object.values(allMatches).filter((m) => {
    if (m.id === excludeMatchId) return false;
    if (m.status !== 'approved' || !m.ranked || !m.result?.approvedAt) return false;
    const matchTime = Date.parse(m.result.approvedAt);
    if (!matchTime || matchTime < cutoff) return false;
    return (
      (m.challengerEmail === emailA && m.opponentEmail === emailB) ||
      (m.challengerEmail === emailB && m.opponentEmail === emailA)
    );
  }).length;
};

// Helper to compute and apply match outcome to player ratings & records
const applyMatchOutcome = (challenger, opponent, challengerScore, opponentScore, isRanked = true) => {
  ensureMatchProfile(challenger);
  ensureMatchProfile(opponent);

  let ratingChanges = null;
  if (isRanked) {
    const actualChallenger = challengerScore > opponentScore ? 1 : challengerScore < opponentScore ? 0 : 0.5;
    const challengerChange = LEAGUE_CONFIG.calculateEloChange(challenger.rating, opponent.rating, actualChallenger, LEAGUE_CONFIG.elo.rankedKFactor);
    const opponentChange = -challengerChange;
    challenger.rating = Math.max(100, challenger.rating + challengerChange);
    opponent.rating = Math.max(100, opponent.rating + opponentChange);
    challenger.rankedMatches = (challenger.rankedMatches || 0) + 1;
    opponent.rankedMatches = (opponent.rankedMatches || 0) + 1;
    ratingChanges = { challenger: challengerChange, opponent: opponentChange, system: `Elo K=${LEAGUE_CONFIG.elo.rankedKFactor}` };
  }

  if (!isRanked) return ratingChanges;
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
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  const email = sessionUser?.email;
  if (!match || !email) return res.status(401).json({ message: 'Sign in with your verified account to report this match score.' });
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

  let autoApproved = false;
  let opponentNotified = null;
  let ownerNotified = null;

  if (!otherReport) {
    match.status = 'awaiting-opponent';
  } else {
    const scoresMatch = report.challengerScore === otherReport.challengerScore && report.opponentScore === otherReport.opponentScore;
    const bothHaveEvidence = Boolean(
      report.evidence?.file &&
      otherReport.evidence?.file &&
      fs.existsSync(path.join(EVIDENCE_DIR, path.basename(report.evidence.file))) &&
      fs.existsSync(path.join(EVIDENCE_DIR, path.basename(otherReport.evidence.file)))
    );

    if (scoresMatch && bothHaveEvidence) {
      match.status = 'approved';
      match.result.challengerScore = report.challengerScore;
      match.result.opponentScore = report.opponentScore;
      match.result.approvedAt = new Date().toISOString();
      match.result.approvedBy = 'system:auto-approval';
      match.result.reviewNote = 'Auto-approved: both player score reports and screenshots matched.';

      const challenger = users[match.challengerEmail];
      const opponent = users[match.opponentEmail];
      if (challenger && opponent) {
        // Enforce max 2 ranked matches counted per 24 hours between the same two opponents (anti-farming protection)
        const recentRankedCount = countRecentRankedMatches(matches, match.challengerEmail, match.opponentEmail, match.id);
        const isRankedEligible = match.ranked && recentRankedCount < 2;

        const ratingChanges = applyMatchOutcome(challenger, opponent, report.challengerScore, report.opponentScore, isRankedEligible);
        if (ratingChanges) {
          match.result.ratingChanges = ratingChanges;
        } else if (match.ranked && !isRankedEligible) {
          match.result.ratingChanges = null;
          match.result.farmCapApplied = true;
        }
        writeUsers(users);
      }
      autoApproved = true;
    } else {
      match.status = 'disputed';
    }
  }

  writeMatches(matches);

  if (!otherReport && users[otherEmail]) {
    const opponent = users[otherEmail];
    const opponentToken = createToken();
    try {
      await sendEmail({
        to: opponent.email,
        subject: `${user.gamerTag} submitted a match score`,
        html: emailLayout('Your opponent reported the score', `${user.gamerTag} submitted ${report.challengerScore} – ${report.opponentScore}. Open your private link to report your score and upload your own screenshot.`, privateMatchUrl(match.id, opponentToken), 'Review private match', opponent.firstName, 'This private link expires in 180 days. Do not forward it; it grants access to this match only.')
      });
      match.accessTokens[otherEmail] = { tokenHash: hashToken(opponentToken), expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 };
      writeMatches(matches);
      opponentNotified = true;
    } catch (error) {
      console.error(`Opponent score notification failed for match ${match.id}:`, error);
      opponentNotified = false;
    }
  }

  if (autoApproved) {
    const challenger = users[match.challengerEmail];
    const opponent = users[match.opponentEmail];
    if (challenger && opponent) {
      const summary = `${challenger.gamerTag} ${report.challengerScore} – ${report.opponentScore} ${opponent.gamerTag}`;
      const eloNote = match.result.ratingChanges
        ? ` Elo updates: ${challenger.gamerTag} (${match.result.ratingChanges.challenger > 0 ? '+' : ''}${match.result.ratingChanges.challenger}), ${opponent.gamerTag} (${match.result.ratingChanges.opponent > 0 ? '+' : ''}${match.result.ratingChanges.opponent}).`
        : (match.result.farmCapApplied ? ' (Daily ranked Elo match cap reached between these opponents; no additional Elo change applied).' : '');
      await Promise.all([challenger, opponent].map(async (player) => {
        try {
          return await notifyMatchParticipant(match, player, {
            subject: `Match result auto-approved: ${summary}`,
            title: 'Match result auto-approved',
            message: `Both score reports and screenshots matched. Final score: ${summary}.${eloNote}`
          });
        } catch (err) {
          console.error(`Auto-approval email notification failed for ${player.email}:`, err);
          return false;
        }
      }));
      writeMatches(matches);
    }
  } else if (match.status === 'disputed' && OWNER_EMAIL && OWNER_REVIEW_TOKEN.length >= 32) {
    try {
      await sendEmail({
        to: OWNER_EMAIL,
        subject: `Disputed match result needs review: ${users[match.challengerEmail]?.gamerTag || 'Player'} vs ${users[match.opponentEmail]?.gamerTag || 'Player'}`,
        html: emailLayout('Disputed match result awaiting review', `The score reports submitted by the players do not match. Review both screenshots and decide the verified score in the owner panel.`, `${BASE_URL}/matches.html?owner=${encodeURIComponent(OWNER_REVIEW_TOKEN)}#challenges`, 'Review result', '', 'This private owner link grants access to match review. Keep it secret; change OWNER_REVIEW_TOKEN to revoke old links.')
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
    autoApproved,
    opponentNotified,
    ownerNotified,
    ratingChanges: match.result?.ratingChanges || null,
    message: autoApproved
      ? 'Both reports and screenshots matched! Match result auto-approved.'
      : match.status === 'disputed'
        ? `The reports differ.${ownerNotified ? ' The owner has been notified to review both screenshots.' : ' Pending owner review of screenshots.'}`
        : `Score submitted.${opponentNotified === false ? ' Opponent email delivery failed.' : ' Waiting for your opponent to confirm with their own report.'}`,
    ownerReviewConfigured
  });
});

app.post('/api/matches/:id/walkover', async (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  const email = sessionUser?.email;
  if (!match || !email) return res.status(401).json({ message: 'Sign in with your verified account to claim a walkover.' });
  if (!['accepted', 'awaiting-opponent'].includes(match.status)) {
    return res.status(409).json({ message: 'Walkovers can only be claimed for scheduled, accepted matches.' });
  }

  const kickOff = Date.parse(match.scheduledAt);
  const deadline = kickOff + 20 * 60 * 1000;
  const now = Date.now();
  if (now < deadline) {
    const minsLeft = Math.ceil((deadline - now) / 60000);
    return res.status(400).json({ message: `Walkover can only be claimed if your opponent fails to appear within 20 minutes past kick-off (${minsLeft} minute(s) remaining).` });
  }

  const isChallenger = email === match.challengerEmail;
  const challengerScore = isChallenger ? 3 : 0;
  const opponentScore = isChallenger ? 0 : 3;

  if (!match.result) match.result = { reports: {}, confirmations: {} };
  match.status = 'approved';
  match.result.challengerScore = challengerScore;
  match.result.opponentScore = opponentScore;
  match.result.approvedAt = new Date().toISOString();
  match.result.approvedBy = 'system:walkover';
  match.result.walkoverWinner = email;
  match.result.reviewNote = `Walkover awarded to ${users[email]?.gamerTag || 'claimant'}: opponent did not appear within 20 minutes past kick-off.`;

  const challenger = users[match.challengerEmail];
  const opponent = users[match.opponentEmail];
  if (challenger && opponent) {
    const recentMatches = countRecentRankedMatches(matches, match.challengerEmail, match.opponentEmail, match.id);
    const isRankedEligible = match.ranked && recentMatches < 2;
    const ratingChanges = applyMatchOutcome(challenger, opponent, challengerScore, opponentScore, isRankedEligible);
    if (ratingChanges) {
      match.result.ratingChanges = ratingChanges;
    } else if (match.ranked && !isRankedEligible) {
      match.result.ratingChanges = null;
      match.result.farmCapApplied = true;
    }
    writeUsers(users);
  }

  writeMatches(matches);

  if (challenger && opponent) {
    const winnerTag = isChallenger ? challenger.gamerTag : opponent.gamerTag;
    const loserTag = isChallenger ? opponent.gamerTag : challenger.gamerTag;
    await Promise.all([challenger, opponent].map(async (player) => {
      try {
        await sendEmail({
          to: player.email,
          subject: `Walkover declared: ${winnerTag} awarded 3-0 forfeit victory`,
          html: emailLayout(
            'Match Forfeit / Walkover',
            `A 3-0 walkover victory has been officially awarded to ${winnerTag} because ${loserTag} was a no-show 20+ minutes past kick-off.`,
            `${BASE_URL}/matches.html?match=${encodeURIComponent(match.id)}#challenges`,
            'View Match',
            player.firstName
          )
        });
      } catch (e) {
        console.error('Walkover notification email error:', e);
      }
    }));
  }

  res.json({ ok: true, status: 'approved', walkover: true, challengerScore, opponentScore });
});

app.post('/api/matches/:id/report-player', playerReportRateLimit, (req, res) => {
  const users = readUsers();
  const reporter = findSessionUser(req, users);
  if (!reporter) return res.status(401).json({ message: 'Sign in with your verified account to report a player.' });
  if (!reporter.verified) return res.status(403).json({ message: 'Verify your email address before reporting a player.' });
  const match = readMatches()[req.params.id];
  if (!match || ![match.challengerEmail, match.opponentEmail].includes(reporter.email)) {
    return res.status(404).json({ message: 'Only a player in this match can submit a report.' });
  }
  if (match.status === 'cancelled') return res.status(409).json({ message: 'A cancelled invitation cannot be reported as a played match.' });
  const reason = String(req.body.reason || '');
  const allowedReasons = new Set(['no-show', 'inappropriate', 'score-pressure', 'other']);
  if (!allowedReasons.has(reason)) return res.status(400).json({ message: 'Choose a valid reason for the player report.' });
  const details = String(req.body.details || '').trim();
  if (details.length > 1000) return res.status(400).json({ message: 'Report details must be 1,000 characters or fewer.' });
  const reportedEmail = reporter.email === match.challengerEmail ? match.opponentEmail : match.challengerEmail;
  try {
    insertPlayerReport.run({
      id: crypto.randomUUID(),
      matchId: match.id,
      reporterEmail: reporter.email,
      reportedEmail,
      reason,
      details,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ message: 'You have already submitted a report for this match.' });
    }
    throw error;
  }
  res.status(201).json({ ok: true, message: 'Your report was sent privately to league administrators.' });
});

app.post('/api/matches/:id/cancel', (req, res) => {
  const matches = readMatches();
  const match = matches[req.params.id];
  const users = readUsers();
  const sessionUser = findSessionUser(req, users);
  const email = sessionUser?.email;
  if (!match || !email) return res.status(401).json({ message: 'Sign in with your verified account to cancel this invitation.' });
  if (match.challengerEmail !== email || match.status !== 'pending') return res.status(404).json({ message: 'Pending invitation not found.' });
  match.status = 'cancelled';
  writeMatches(matches);
  res.json({ ok: true });
});

app.get('/api/admin/player-reports', requireAdmin, (req, res) => {
  const users = readUsers();
  const reports = database.prepare(`
    SELECT id, match_id, reporter_email, reported_email, reason, details, status, created_at, reviewed_at
    FROM player_reports ORDER BY created_at DESC LIMIT 200
  `).all().map((report) => ({
    id: report.id,
    matchId: report.match_id,
    reporter: users[report.reporter_email]?.gamerTag || 'Deleted player',
    reported: users[report.reported_email]?.gamerTag || 'Deleted player',
    reason: report.reason,
    details: report.details,
    status: report.status,
    createdAt: report.created_at,
    reviewedAt: report.reviewed_at
  }));
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ok: true, reports });
});

app.put('/api/admin/player-reports/:id', requireAdmin, (req, res) => {
  const status = String(req.body.status || '');
  if (!['reviewed', 'dismissed'].includes(status)) return res.status(400).json({ message: 'Choose reviewed or dismissed.' });
  const update = database.prepare('UPDATE player_reports SET status = ?, reviewed_at = ? WHERE id = ?');
  const result = update.run(status, new Date().toISOString(), req.params.id);
  if (!result.changes) return res.status(404).json({ message: 'Player report not found.' });
  res.json({ ok: true, status, message: `Player report marked ${status}.` });
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
    const actualChallenger = challengerScore > opponentScore ? 1 : challengerScore < opponentScore ? 0 : 0.5;
    const challengerChange = LEAGUE_CONFIG.calculateEloChange(challenger.rating, opponent.rating, actualChallenger, LEAGUE_CONFIG.elo.rankedKFactor);
    const opponentChange = -challengerChange;
    challenger.rating += challengerChange;
    opponent.rating += opponentChange;
    challenger.rankedMatches += 1;
    opponent.rankedMatches += 1;
    match.result.ratingChanges = { challenger: challengerChange, opponent: opponentChange, system: `Elo K=${LEAGUE_CONFIG.elo.rankedKFactor}` };
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

// 1. Admin Login (Key or Email+Password)
app.post('/api/admin/login', adminLoginRateLimit, async (req, res) => {
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
      return res.json({ ok: true, admin: true, user: publicProfile(adminUser) });
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
      return res.json({ ok: true, admin: true, user: publicProfile(adminUser) });
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
    return res.json({ ok: true, admin: true, user: publicProfile(user) });
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
  let assignedIds = false;
  for (const user of Object.values(users)) {
    if (!user.id) {
      user.id = crypto.randomUUID();
      assignedIds = true;
    }
  }
  if (assignedIds) writeUsers(users);
  const userList = Object.values(users)
    .sort((a, b) => (b.rating || 1000) - (a.rating || 1000))
    .map((u) => ({
      id: u.id,
      name: u.firstName || u.name,
      gamerTag: u.gamerTag || u.gamerName,
      rating: u.rating || 1000,
      wins: u.wins || 0,
      draws: u.draws || 0,
      losses: u.losses || 0,
      rankedMatches: u.rankedMatches || 0,
      verified: Boolean(u.verified),
      role: u.role || ((OWNER_EMAIL && u.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) ? 'admin' : 'user'),
      isOwner: Boolean(OWNER_EMAIL && u.email.toLowerCase() === OWNER_EMAIL.toLowerCase()),
      platform: u.platform || '',
      country: u.country || '',
      timeZone: u.timeZone || 'UTC',
      clubName: u.clubName || ''
    }));
  res.json({ ok: true, users: userList });
});

// 5. Admin Add User Live
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { email, gamerTag, name, rating, verified, role, password, platform, country, timeZone, clubName } = req.body || {};
  if (!email || !gamerTag) return res.status(400).json({ message: 'Email and gamer tag are required.' });
  const cleanEmail = String(email).trim().toLowerCase();
  const users = readUsers();
  if (users[cleanEmail]) return res.status(409).json({ message: 'A player with this email already exists.' });

  let passwordHash = null;
  if (password && String(password).length >= 6) {
    passwordHash = await hashPassword(String(password));
  }

  const newUser = {
    id: crypto.randomUUID(),
    email: cleanEmail,
    firstName: String(name || gamerTag).trim(),
    name: String(name || gamerTag).trim(),
    gamerTag: String(gamerTag).trim(),
    gamerName: String(gamerTag).trim(),
    platform: ['Mobile', 'Console', 'PC'].includes(platform) ? platform : '',
    country: String(country || '').trim().slice(0, 60),
    timeZone: normalizedTimeZone(timeZone) || 'UTC',
    clubName: String(clubName || '').trim().slice(0, 60),
    rating: Number.isSafeInteger(Number(rating)) ? Number(rating) : LEAGUE_CONFIG.elo.initialRating,
    wins: 0,
    draws: 0,
    losses: 0,
    rankedMatches: 0,
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
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const identifier = req.params.id;
  const users = readUsers();
  const entry = findUserEntry(users, identifier);
  if (!entry) return res.status(404).json({ message: 'Player account not found.' });
  const [originalEmail, user] = entry;

  const { email, gamerTag, name, rating, verified, role, platform, country, timeZone, clubName } = req.body || {};

  if (gamerTag) {
    const newTag = String(gamerTag).trim();
    if (!/^[\p{L}\p{N}_. -]{3,32}$/u.test(newTag)) return res.status(400).json({ message: 'Enter a valid gamer tag with 3 to 32 letters, numbers, spaces, dots, underscores, or hyphens.' });
    if (Object.entries(users).some(([emailKey, candidate]) => emailKey !== originalEmail && String(candidate.gamerTag || '').toLocaleLowerCase() === newTag.toLocaleLowerCase())) {
      return res.status(409).json({ message: 'That gamer tag is already in use.' });
    }
    user.gamerTag = newTag;
    user.gamerName = newTag;
  }
  if (name) {
    user.firstName = String(name).trim();
    user.name = String(name).trim();
  }
  if (rating !== undefined && Number.isSafeInteger(Number(rating))) {
    user.rating = Number(rating);
  }
  if (verified !== undefined) user.verified = Boolean(verified);
  if (role) user.role = role === 'admin' ? 'admin' : 'user';
  if (platform !== undefined) {
    if (platform && !['Mobile', 'Console', 'PC'].includes(platform)) return res.status(400).json({ message: 'Choose a supported eFootball platform.' });
    user.platform = platform || '';
  }
  if (country !== undefined) {
    if (String(country).trim().length > 60) return res.status(400).json({ message: 'Country must be 60 characters or fewer.' });
    user.country = String(country).trim();
  }
  if (timeZone !== undefined) {
    const validTimeZone = normalizedTimeZone(String(timeZone));
    if (!validTimeZone) return res.status(400).json({ message: 'Enter a valid time zone.' });
    user.timeZone = validTimeZone;
  }
  if (clubName !== undefined) {
    if (String(clubName).trim().length > 60) return res.status(400).json({ message: 'Club name must be 60 characters or fewer.' });
    user.clubName = String(clubName).trim();
  }

  // If email address was edited
  if (email && String(email).trim().toLowerCase() !== originalEmail) {
    const newEmail = String(email).trim().toLowerCase();
    if (!safeEmail(newEmail)) return res.status(400).json({ message: 'Enter a valid email address.' });
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
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const users = readUsers();
  const entry = findUserEntry(users, req.params.id);
  if (!entry) return res.status(404).json({ message: 'Player account not found.' });
  const [email, user] = entry;
  if (OWNER_EMAIL && email === OWNER_EMAIL) {
    return res.status(400).json({ message: 'The primary owner account cannot be deleted.' });
  }
  const deletedTag = user.gamerTag || 'Player';
  delete users[email];
  deleteUser.run(email);
  res.json({ ok: true, message: `Player ${deletedTag} deleted successfully.` });
});

// 8. Admin Reset Password Live
app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  const users = readUsers();
  const entry = findUserEntry(users, req.params.id);
  if (!entry) return res.status(404).json({ message: 'Player account not found.' });
  const [, user] = entry;

  user.passwordHash = await hashPassword(String(newPassword));
  user.sessionTokenHash = null;
  writeUsers(users);
  res.json({ ok: true, message: `Password for ${user.gamerTag || 'player'} has been updated.` });
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
      challenger: { id: challenger.id, gamerTag: challenger.gamerTag, rating: challenger.rating },
      opponent: { id: opponent.id, gamerTag: opponent.gamerTag, rating: opponent.rating },
      scores: m.result ? { challenger: m.result.challengerScore, opponent: m.result.opponentScore } : null,
      reports: m.result?.reports ? Object.entries(m.result.reports).map(([em, rep]) => ({
        playerId: users[em]?.id || null,
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
  const { challengerId, opponentId, competition, scheduledAt, ranked } = req.body || {};
  const users = readUsers();
  const challengerEntry = findUserEntry(users, challengerId);
  const opponentEntry = findUserEntry(users, opponentId);

  if (!challengerEntry || !opponentEntry) {
    return res.status(400).json({ message: 'Both player accounts must exist before creating a fixture.' });
  }
  const [cEmail] = challengerEntry;
  const [oEmail] = opponentEntry;
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
  deleteMatchChatMessages.run(req.params.id);
  delete matches[req.params.id];
  writeMatches(matches);
  res.json({ ok: true, message: 'Match deleted.' });
});

// 14. Admin Live Content Operations
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '40'), 10) || 40));
  const activity = database.prepare(`SELECT id, actor, action, entity, entity_id AS entityId, summary, created_at AS createdAt
    FROM admin_activity ORDER BY created_at DESC LIMIT ?`).all(limit);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ok: true, activity });
});

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
  recordAdminActivity(req, 'updated', 'site content', key, `Updated ${key} content`);
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
  const tournaments = getSiteContent('tournaments', []);
  const users = readUsers();
  const visible = tournaments.filter((tournament) => tournament.published !== false).map((tournament) => ({
    ...tournament,
    registeredCount: Object.values(users).filter((candidate) => candidate.verified && candidate.tournamentInterests?.[tournament.id]).length
  }));
  res.json({ ok: true, tournaments: visible });
});

app.get('/api/site/cup', (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const event = tournaments.find((tournament) => tournament.published !== false && tournament.featuredCup === true) || null;
  const bracket = event ? getSiteContent('bracket', null) : null;
  res.setHeader('Cache-Control', 'public, max-age=15');
  res.json({ ok: true, event, bracket });
});

app.get('/api/site/clubs', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ ok: true, clubs: getPublicClubs(readUsers()) });
});

app.get('/api/site/bracket', (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const cupPublished = tournaments.some((tournament) => tournament.published !== false && tournament.featuredCup === true);
  res.setHeader('Cache-Control', 'public, max-age=15');
  res.json({ ok: true, bracket: cupPublished ? getSiteContent('bracket', null) : null });
});

app.get('/api/site/live-streams', (req, res) => {
  const users = readUsers();
  const now = Date.now();
  const streams = Object.values(readMatches())
    .filter((match) => {
      if (match.status !== 'accepted' || !match.streamUrl) return false;
      const scheduledTime = Date.parse(match.scheduledAt);
      if (!Number.isFinite(scheduledTime) || scheduledTime < now - 8 * 60 * 60 * 1000) return false;
      try {
        return Boolean(normalizePublicStreamUrl(match.streamUrl));
      } catch {
        return false;
      }
    })
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .slice(0, 50)
    .map((match) => {
      const { challenger, opponent } = matchParticipants(match, users);
      if (!challenger || !opponent) return null;
      return {
        id: match.id,
        challenger: publicMatchProfile(challenger),
        opponent: publicMatchProfile(opponent),
        scheduledAt: match.scheduledAt,
        timeZone: match.timeZone || 'UTC',
        streamUrl: match.streamUrl
      };
    })
    .filter(Boolean);

  res.setHeader('Cache-Control', 'public, max-age=15');
  res.json({ ok: true, streams });
});

// --- TOURNAMENTS LIVE MANAGEMENT & PLAYER REGISTRATION ---

// Admin: Create tournament
app.post('/api/admin/tournaments', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const { title, kicker, badge, format, slots, status, dates, startsAt, desc, registrationOpen, checkInOpen, prizePool, prizeDetails, eventType, platform, rules, minElo, maxElo, entryLink, featuredCup, published } = req.body || {};
  const isFeaturedCup = featuredCup === true;
  if (published !== undefined && typeof published !== 'boolean') return res.status(400).json({ message: 'Tournament visibility must be set to published or draft.' });
  if (!title || !format) return res.status(400).json({ message: 'Title and format are required.' });
  if (startsAt && !Number.isFinite(Date.parse(startsAt))) return res.status(400).json({ message: 'Choose a valid event start date and time.' });
  const cleanTitle = isFeaturedCup ? 'Tim League Cup 2026' : String(title).trim().slice(0, 80);
  const cleanFormat = String(format).trim().slice(0, 100);
  const tournamentStatus = ['Registration Open', 'Coming Soon', 'In Progress', 'Completed', 'Cancelled'].includes(status) ? status : 'Coming Soon';
  const cleanMinElo = minElo === null || minElo === '' || minElo === undefined ? null : Number(minElo);
  const cleanMaxElo = maxElo === null || maxElo === '' || maxElo === undefined ? null : Number(maxElo);
  if (!cleanTitle || !cleanFormat) return res.status(400).json({ message: 'Tournament title and format cannot be blank.' });
  if ((cleanMinElo !== null && (!Number.isSafeInteger(cleanMinElo) || cleanMinElo < 0 || cleanMinElo > 3000)) ||
      (cleanMaxElo !== null && (!Number.isSafeInteger(cleanMaxElo) || cleanMaxElo < 0 || cleanMaxElo > 3000)) ||
      (cleanMinElo !== null && cleanMaxElo !== null && cleanMinElo > cleanMaxElo)) {
    return res.status(400).json({ message: 'Enter valid Elo limits from 0 to 3,000, with minimum no greater than maximum.' });
  }
  if (isFeaturedCup && tournaments.some((event) => event.featuredCup)) {
    return res.status(409).json({ message: 'Only one tournament can be featured as the League Cup. Edit the existing League Cup event instead.' });
  }
  const newT = {
    id: `tourn-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    title: cleanTitle,
    kicker: String(kicker || '').trim().slice(0, 80),
    badge: String(badge || 'EVENT').trim().toUpperCase().slice(0, 20),
    format: cleanFormat,
    slots: String(slots || 'TBC').trim(),
    status: tournamentStatus === 'Registration Open' && registrationOpen !== true ? 'Coming Soon' : tournamentStatus,
    published: published !== false,
    eventType: String(eventType || '').trim().slice(0, 50),
    platform: String(platform || '').trim().slice(0, 80),
    dates: String(dates || 'TBC').trim().slice(0, 100),
    startsAt: startsAt && Number.isFinite(Date.parse(startsAt)) ? new Date(startsAt).toISOString() : null,
    desc: String(desc || '').trim().slice(0, 500),
    rules: String(rules || '').trim().slice(0, 3000),
    registrationOpen: tournamentStatus === 'Registration Open' && registrationOpen === true,
    checkInOpen: checkInOpen === true,
    featuredCup: isFeaturedCup,
    prizePool: String(prizePool || '').trim().slice(0, 100),
    prizeDetails: String(prizeDetails || '').trim().slice(0, 1000),
    minElo: cleanMinElo,
    maxElo: cleanMaxElo,
    entryLink: String(entryLink || '').trim().slice(0, 200),
    createdAt: new Date().toISOString()
  };
  tournaments.push(newT);
  setSiteContent('tournaments', tournaments);
  recordAdminActivity(req, 'created', 'tournament', newT.id, `Created ${newT.title} · ${newT.published ? 'published' : 'draft'}`);
  res.status(201).json({ ok: true, tournament: newT, message: `Tournament "${newT.title}" created successfully.` });
});

// Admin: Edit tournament
app.put('/api/admin/tournaments/:id', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const idx = tournaments.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Tournament not found.' });
  const { title, kicker, badge, format, slots, status, dates, startsAt, desc, registrationOpen, checkInOpen, prizePool, prizeDetails, eventType, platform, rules, minElo, maxElo, entryLink, featuredCup, published } = req.body || {};
  const t = tournaments[idx];
  if (published !== undefined && typeof published !== 'boolean') return res.status(400).json({ message: 'Tournament visibility must be set to published or draft.' });
  const isFeaturedCup = featuredCup === undefined ? Boolean(t.featuredCup) : featuredCup === true;
  const cleanMinElo = minElo === undefined ? t.minElo ?? null : minElo === null || minElo === '' ? null : Number(minElo);
  const cleanMaxElo = maxElo === undefined ? t.maxElo ?? null : maxElo === null || maxElo === '' ? null : Number(maxElo);
  if ((cleanMinElo !== null && (!Number.isSafeInteger(cleanMinElo) || cleanMinElo < 0 || cleanMinElo > 3000)) ||
      (cleanMaxElo !== null && (!Number.isSafeInteger(cleanMaxElo) || cleanMaxElo < 0 || cleanMaxElo > 3000)) ||
      (cleanMinElo !== null && cleanMaxElo !== null && cleanMinElo > cleanMaxElo)) {
    return res.status(400).json({ message: 'Enter valid Elo limits from 0 to 3,000, with minimum no greater than maximum.' });
  }
  if (isFeaturedCup && tournaments.some((event) => event.id !== t.id && event.featuredCup)) {
    return res.status(409).json({ message: 'Only one tournament can be featured as the League Cup. Remove the current League Cup designation first.' });
  }
  if (isFeaturedCup) t.title = 'Tim League Cup 2026';
  else if (title) t.title = String(title).trim().slice(0, 80);
  if (kicker !== undefined) t.kicker = String(kicker).trim().slice(0, 80);
  if (badge !== undefined) t.badge = String(badge).trim().toUpperCase().slice(0, 20);
  if (format) t.format = String(format).trim().slice(0, 100);
  if (slots !== undefined) t.slots = String(slots).trim();
  if (status && ['Registration Open', 'Coming Soon', 'In Progress', 'Completed', 'Cancelled'].includes(status)) t.status = status;
  if (dates !== undefined) t.dates = String(dates).trim().slice(0, 100);
  if (startsAt !== undefined) {
    if (startsAt && !Number.isFinite(Date.parse(startsAt))) return res.status(400).json({ message: 'Choose a valid event start date and time.' });
    t.startsAt = startsAt ? new Date(startsAt).toISOString() : null;
  }
  if (desc !== undefined) t.desc = String(desc).trim().slice(0, 500);
  if (registrationOpen !== undefined) t.registrationOpen = Boolean(registrationOpen);
  if (checkInOpen !== undefined) t.checkInOpen = Boolean(checkInOpen);
  if (featuredCup !== undefined) t.featuredCup = isFeaturedCup;
  if (published !== undefined) t.published = published;
  if (eventType !== undefined) t.eventType = String(eventType).trim().slice(0, 50);
  if (platform !== undefined) t.platform = String(platform).trim().slice(0, 80);
  if (prizePool !== undefined) t.prizePool = String(prizePool).trim().slice(0, 100);
  if (prizeDetails !== undefined) t.prizeDetails = String(prizeDetails).trim().slice(0, 1000);
  if (rules !== undefined) t.rules = String(rules).trim().slice(0, 3000);
  t.minElo = cleanMinElo;
  t.maxElo = cleanMaxElo;
  if (entryLink !== undefined) t.entryLink = String(entryLink).trim().slice(0, 200);
  if (t.status !== 'Registration Open' || !t.registrationOpen) {
    t.status = t.status === 'Registration Open' ? 'Coming Soon' : t.status;
    t.registrationOpen = false;
  }
  t.updatedAt = new Date().toISOString();
  setSiteContent('tournaments', tournaments);
  recordAdminActivity(req, 'updated', 'tournament', t.id, `Updated ${t.title} · ${t.published ? 'published' : 'draft'}`);
  res.json({ ok: true, tournament: t, message: `Tournament "${t.title}" updated live.` });
});

// Admin: Delete tournament
app.delete('/api/admin/tournaments/:id', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const idx = tournaments.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Tournament not found.' });
  const removed = tournaments.splice(idx, 1)[0];
  setSiteContent('tournaments', tournaments);
  recordAdminActivity(req, 'deleted', 'tournament', removed.id, `Deleted ${removed.title}`);
  res.json({ ok: true, message: `Tournament "${removed.title}" deleted.` });
});

// User: Register or toggle interest in a tournament
app.post('/api/tournaments/:id/register-interest', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ message: 'Please sign in to register for this tournament.' });
  const tournId = req.params.id;
  const tournaments = getSiteContent('tournaments', []);
  const tourn = tournaments.find(t => t.id === tournId);
  if (!tourn) return res.status(404).json({ message: 'Tournament not found.' });

  user.tournamentInterests = user.tournamentInterests || {};
  if (user.tournamentInterests[tournId]) {
    delete user.tournamentInterests[tournId];
    writeUsers(users);
    return res.json({ ok: true, registered: false, message: `Registration withdrawn from ${tourn.title}.` });
  }
  if (tourn.published === false) {
    return res.status(409).json({ message: 'This tournament is not published yet.' });
  }
  if (!tourn.registrationOpen || tourn.status !== 'Registration Open') {
    return res.status(409).json({ message: 'Registration for this tournament is closed.' });
  }
  const rating = Number(user.rating) || 1000;
  if (Number.isFinite(tourn.minElo) && rating < tourn.minElo) {
    return res.status(403).json({ message: `This tournament requires at least ${tourn.minElo} Elo.` });
  }
  if (Number.isFinite(tourn.maxElo) && rating > tourn.maxElo) {
    return res.status(403).json({ message: `This tournament is limited to ${tourn.maxElo} Elo.` });
  }
  const slotLimit = Number.parseInt(String(tourn.slots || ''), 10);
  const registeredCount = Object.values(users).filter((candidate) => candidate.verified && candidate.tournamentInterests?.[tournId]).length;
  if (Number.isSafeInteger(slotLimit) && slotLimit > 0 && registeredCount >= slotLimit) {
    return res.status(409).json({ message: 'All tournament places have been filled.' });
  }
  user.tournamentInterests[tournId] = { registeredAt: new Date().toISOString(), tournamentTitle: tourn.title };
  writeUsers(users);
  res.json({ ok: true, registered: true, message: `Registration confirmed for ${tourn.title}.` });
});

app.post('/api/tournaments/:id/check-in', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ message: 'Sign in to check in to this tournament.' });
  const tournaments = getSiteContent('tournaments', []);
  const tournament = tournaments.find((event) => event.id === req.params.id && event.published !== false);
  if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });
  let entry = user.tournamentInterests?.[tournament.id];
  if (!entry) return res.status(409).json({ message: 'Register for this tournament before checking in.' });
  if (typeof entry !== 'object') {
    entry = { registeredAt: null, tournamentTitle: tournament.title };
    user.tournamentInterests[tournament.id] = entry;
  }
  if (!tournament.checkInOpen) return res.status(409).json({ message: 'Check-in has not opened for this tournament yet.' });
  if (entry.checkedInAt) return res.json({ ok: true, checkedIn: true, checkedInAt: entry.checkedInAt, message: 'You are already checked in.' });
  entry.checkedInAt = new Date().toISOString();
  writeUsers(users);
  res.json({ ok: true, checkedIn: true, checkedInAt: entry.checkedInAt, message: `Check-in confirmed for ${tournament.title}.` });
});

// User: Get my tournament interests
app.get('/api/me/tournaments', (req, res) => {
  const users = readUsers();
  const user = findSessionUser(req, users);
  if (!user) return res.status(401).json({ authenticated: false });
  const interests = user.tournamentInterests || {};
  const tournaments = getSiteContent('tournaments', []);
  const myTournaments = tournaments
    .filter(t => t.published !== false && interests[t.id])
    .map(t => ({ ...t, registeredAt: interests[t.id].registeredAt, checkedInAt: interests[t.id].checkedInAt || null }));
  res.json({ ok: true, timeZone: user.timeZone || null, tournaments: myTournaments, interestIds: myTournaments.map((tournament) => tournament.id) });
});

// Public: Get single tournament with public participants
app.get('/api/site/tournaments/:id', (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const tourn = tournaments.find(t => t.id === req.params.id && t.published !== false);
  if (!tourn) return res.status(404).json({ message: 'Tournament not found.' });

  const users = readUsers();
  const participants = [];
  for (const u of Object.values(users)) {
    if (u.verified && u.tournamentInterests && u.tournamentInterests[tourn.id]) {
      participants.push({
        gamerTag: u.gamerTag || u.gamerName || 'Player',
        avatarUrl: publicMatchProfile(u).avatarUrl,
        rating: u.rating || 1000,
        registeredAt: u.tournamentInterests[tourn.id].registeredAt || null,
        checkedIn: Boolean(u.tournamentInterests[tourn.id].checkedInAt)
      });
    }
  }
  participants.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));

  const entryCount = participants.length;

  res.json({
    ok: true,
    tournament: tourn,
    participants,
    totalParticipants: entryCount
  });
});

// Admin: Get detailed tournament participants including email and status
app.get('/api/admin/tournaments/:id/participants', requireAdmin, (req, res) => {
  const tournaments = getSiteContent('tournaments', []);
  const tourn = tournaments.find(t => t.id === req.params.id);
  if (!tourn) return res.status(404).json({ message: 'Tournament not found.' });

  const users = readUsers();
  const list = [];
  let assignedIds = false;
  for (const u of Object.values(users)) {
    if (u.verified && u.tournamentInterests && u.tournamentInterests[tourn.id]) {
      if (!u.id) {
        u.id = crypto.randomUUID();
        assignedIds = true;
      }
      list.push({
        id: u.id,
        gamerTag: u.gamerTag || u.gamerName,
        name: u.firstName || u.name,
        rating: u.rating || 1000,
        wins: u.wins || 0,
        draws: u.draws || 0,
        losses: u.losses || 0,
        registeredAt: u.tournamentInterests[tourn.id].registeredAt || null,
        checkedInAt: u.tournamentInterests[tourn.id].checkedInAt || null
      });
    }
  }
  if (assignedIds) writeUsers(users);
  list.sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
  res.json({ ok: true, tournament: tourn, participants: list });
});

// Admin: Remove player from tournament
app.delete('/api/admin/tournaments/:id/participants/:userId', requireAdmin, (req, res) => {
  const users = readUsers();
  const entry = findUserEntry(users, req.params.userId);
  if (!entry) return res.status(404).json({ message: 'Player is not registered for this tournament.' });
  const [, user] = entry;
  if (!user || !user.tournamentInterests || !user.tournamentInterests[req.params.id]) {
    return res.status(404).json({ message: 'Player is not registered for this tournament.' });
  }
  delete user.tournamentInterests[req.params.id];
  writeUsers(users);
  res.json({ ok: true, message: `Removed ${user.gamerTag || 'player'} from tournament.` });
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
