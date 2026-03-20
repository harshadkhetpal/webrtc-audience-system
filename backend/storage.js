/**
 * storage.js — File-based persistence for workspaces and sessions.
 * Uses only Node.js built-ins (fs, crypto, path).
 * No external dependencies required.
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const WS_FILE      = path.join(DATA_DIR, 'workspaces.json');

// ── Bootstrap directories ─────────────────────────────────────────────────────
[DATA_DIR, SESSIONS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJSON(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return fallback; }
}

/** Atomic write: write to .tmp then rename — prevents partial-file corruption */
function atomicWrite(fp, data) {
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

function hashPasscode(passcode, workspaceId) {
  return crypto
    .createHash('sha256')
    .update(passcode + workspaceId)
    .digest('hex');
}

// ── Workspaces ────────────────────────────────────────────────────────────────
let workspaces = readJSON(WS_FILE, {});

// Seed a default workspace on first run
if (!workspaces.default) {
  const defaultPasscode = process.env.MODERATOR_PASSCODE || 'admin123';
  workspaces.default = {
    id:           'default',
    name:         'My Organisation',
    passcodeHash: hashPasscode(defaultPasscode, 'default'),
    createdAt:    new Date().toISOString(),
  };
  atomicWrite(WS_FILE, workspaces);
  console.log(`🏢 Default workspace created. Passcode: ${defaultPasscode}`);
}

function getWorkspace(id) { return workspaces[id] || null; }
function allWorkspaces()  { return Object.values(workspaces); }

function createWorkspace({ name, passcode }) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const id = `ws_${slug}_${crypto.randomUUID().slice(0, 6)}`;
  workspaces[id] = {
    id,
    name,
    passcodeHash: hashPasscode(passcode, id),
    createdAt:    new Date().toISOString(),
  };
  atomicWrite(WS_FILE, workspaces);
  // Create session directory for this workspace
  const wsDir = path.join(SESSIONS_DIR, id);
  if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });
  return workspaces[id];
}

function verifyPasscode(workspaceId, passcode) {
  const ws = getWorkspace(workspaceId);
  if (!ws) return false;
  return ws.passcodeHash === hashPasscode(passcode, workspaceId);
}

// ── Auth Tokens ───────────────────────────────────────────────────────────────
const authTokens = new Map(); // token → { workspaceId, issuedAt }

function issueToken(workspaceId) {
  const token = crypto.randomUUID();
  authTokens.set(token, { workspaceId, issuedAt: Date.now() });
  return token;
}

function validateToken(token) {
  const t = authTokens.get(token);
  if (!t) return null;
  // 24-hour expiry
  if (Date.now() - t.issuedAt > 24 * 60 * 60 * 1000) {
    authTokens.delete(token);
    return null;
  }
  return t.workspaceId;
}

function revokeToken(token) { authTokens.delete(token); }

// ── Sessions ──────────────────────────────────────────────────────────────────
function sessionPath(workspaceId, sessionId) {
  const wsDir = path.join(SESSIONS_DIR, workspaceId);
  if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });
  return path.join(wsDir, `${sessionId}.json`);
}

function saveSession(session) {
  // Strip non-serialisable fields (Set, etc.)
  const clean = {
    ...session,
    preQuestions: (session.preQuestions || []).map(({ voters, ...rest }) => rest),
    polls:        (session.polls || []).map(({ pollVoters, ...rest }) => rest),
    aiSummary:    session.aiSummary || null,
  };
  atomicWrite(sessionPath(clean.workspaceId, clean.sessionId), clean);
  return clean;
}

function patchSessionAI(workspaceId, sessionId, aiSummary) {
  const fp = sessionPath(workspaceId, sessionId);
  if (!fs.existsSync(fp)) return;
  const session = readJSON(fp, null);
  if (!session) return;
  session.aiSummary = aiSummary;
  atomicWrite(fp, session);
}

function listSessions(workspaceId, limit = 50) {
  const wsDir = path.join(SESSIONS_DIR, workspaceId);
  if (!fs.existsSync(wsDir)) return [];
  const files = fs.readdirSync(wsDir)
    .filter(f => f.endsWith('.json'))
    .sort()           // alphabetically = chronologically (UUIDs won't sort, use timestamps)
    .reverse();       // newest first
  return files.slice(0, limit).map(f => {
    const fp = path.join(wsDir, f);
    try {
      const s = JSON.parse(fs.readFileSync(fp, 'utf8'));
      // Return a lightweight index entry
      return {
        sessionId:    s.sessionId,
        workspaceId:  s.workspaceId,
        roomId:       s.roomId,
        startedAt:    s.startedAt,
        endedAt:      s.endedAt,
        speakerCount: (s.speakers || []).length,
        questionCount:(s.preQuestions || []).length,
        pollCount:    (s.polls || []).length,
        hasSummary:   !!s.aiSummary,
      };
    } catch { return null; }
  }).filter(Boolean);
}

function getSession(workspaceId, sessionId) {
  const fp = sessionPath(workspaceId, sessionId);
  return readJSON(fp, null);
}

/**
 * Aggregate analytics across all sessions for a workspace.
 * Computed at query time from JSON files (fast enough for < 1000 sessions).
 */
function getAnalytics(workspaceId, since) {
  const wsDir = path.join(SESSIONS_DIR, workspaceId);
  if (!fs.existsSync(wsDir)) {
    return emptyAnalytics();
  }
  const sinceMs = since ? new Date(since).getTime() : 0;
  const files   = fs.readdirSync(wsDir).filter(f => f.endsWith('.json'));

  let totalSpeakers  = 0;
  let totalDurationSec = 0;
  let totalQuestions = 0;
  let totalPolls     = 0;
  const sectionCounts      = {};
  const topicWordCounts    = {};
  const questionsByDate    = {};
  const speakerMap         = {}; // name → { appearances, totalDurationSec, sections:Set, topics:[] }
  const contributorMap     = {}; // name → { totalVotes, questionCount }
  const sessionSentiments  = []; // [{date, sentiment, speakerCount, questionCount}]

  files.forEach(f => {
    const fp = path.join(wsDir, f);
    try {
      const s = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (since && new Date(s.startedAt).getTime() < sinceMs) return;

      let sessionDuration = 0;
      (s.speakers || []).forEach(sp => {
        totalSpeakers++;
        const dur = sp.durationSec || 0;
        totalDurationSec += dur;
        sessionDuration   += dur;
        const sec = sp.section || 'Unknown';
        sectionCounts[sec] = (sectionCounts[sec] || 0) + 1;
        // word freq from topics
        if (sp.topic) {
          sp.topic.split(/\s+/).forEach(w => {
            const word = w.toLowerCase().replace(/[^a-z]/g, '');
            if (word.length > 3) topicWordCounts[word] = (topicWordCounts[word] || 0) + 1;
          });
        }
        // Speaker performance map (skip anonymous)
        const spName = sp.anonymous ? null : (sp.name || '').trim();
        if (spName) {
          if (!speakerMap[spName]) speakerMap[spName] = { appearances:0, totalDurationSec:0, sections:new Set(), topics:[] };
          speakerMap[spName].appearances++;
          speakerMap[spName].totalDurationSec += dur;
          speakerMap[spName].sections.add(sec);
          if (sp.topic) speakerMap[spName].topics.push(sp.topic);
        }
      });

      (s.preQuestions || []).forEach(q => {
        totalQuestions++;
        const date = (q.submittedAt || s.startedAt || '').slice(0, 10);
        if (date) questionsByDate[date] = (questionsByDate[date] || 0) + 1;
        // Contributor leaderboard
        const qName = (q.name || '').trim();
        if (qName && qName.toLowerCase() !== 'anonymous') {
          if (!contributorMap[qName]) contributorMap[qName] = { totalVotes:0, questionCount:0 };
          contributorMap[qName].totalVotes += (q.votes || 0);
          contributorMap[qName].questionCount++;
        }
      });

      totalPolls += (s.polls || []).length;

      // Session sentiment for timeline
      const date = (s.startedAt || '').slice(0, 10);
      if (date) {
        const ai = s.aiSummary;
        sessionSentiments.push({
          date,
          sessionId: s.sessionId,
          sentiment: ai?.sentiment || null,
          speakerCount: (s.speakers || []).length,
          questionCount: (s.preQuestions || []).length,
          avgDurationSec: (s.speakers || []).length > 0 ? Math.round(sessionDuration / (s.speakers || []).length) : 0,
        });
      }
    } catch { /* skip corrupt files */ }
  });

  const topSections = Object.entries(sectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([section, count]) => ({ section, count }));

  const topTopics = Object.entries(topicWordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  const questionsOverTime = Object.entries(questionsByDate)
    .sort()
    .map(([date, count]) => ({ date, count }));

  const topSpeakers = Object.entries(speakerMap)
    .sort((a, b) => b[1].appearances - a[1].appearances || b[1].totalDurationSec - a[1].totalDurationSec)
    .slice(0, 20)
    .map(([name, d]) => ({
      name,
      appearances:     d.appearances,
      totalDurationSec: d.totalDurationSec,
      avgDurationSec:  Math.round(d.totalDurationSec / d.appearances),
      sections:        [...d.sections].slice(0, 3).join(', '),
      latestTopic:     d.topics.at(-1) || '',
    }));

  const topContributors = Object.entries(contributorMap)
    .sort((a, b) => b[1].totalVotes - a[1].totalVotes || b[1].questionCount - a[1].questionCount)
    .slice(0, 20)
    .map(([name, d]) => ({ name, totalVotes: d.totalVotes, questionCount: d.questionCount }));

  // ── Feedback aggregation ──────────────────────────────────────────────────
  let feedbackTotal = 0, feedbackStarSum = 0;
  const feedbackByRating = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const recentComments = [];
  files.forEach(f => {
    const fp = path.join(wsDir, f);
    try {
      const s = JSON.parse(fs.readFileSync(fp, 'utf8'));
      (s.feedback || []).forEach(fb => {
        feedbackTotal++;
        feedbackStarSum += fb.stars;
        feedbackByRating[fb.stars] = (feedbackByRating[fb.stars] || 0) + 1;
        if (fb.comment) recentComments.push({ stars: fb.stars, comment: fb.comment, ts: fb.ts });
      });
    } catch { /* skip */ }
  });
  recentComments.sort((a, b) => b.ts - a.ts);

  return {
    totalSessions:   files.length,
    totalSpeakers,
    totalQuestions,
    totalPolls,
    avgDurationSec:  totalSpeakers > 0 ? Math.round(totalDurationSec / totalSpeakers) : 0,
    topSections,
    topTopics,
    questionsOverTime,
    sectionHeatmap:  sectionCounts,
    topSpeakers,
    topContributors,
    sessionSentiments: sessionSentiments.sort((a, b) => a.date.localeCompare(b.date)),
    feedback: {
      total:        feedbackTotal,
      avgRating:    feedbackTotal > 0 ? Math.round((feedbackStarSum / feedbackTotal) * 10) / 10 : null,
      byRating:     feedbackByRating,
      recentComments: recentComments.slice(0, 10),
    },
  };
}

function emptyAnalytics() {
  return {
    totalSessions: 0, totalSpeakers: 0, totalQuestions: 0, totalPolls: 0,
    avgDurationSec: 0, topSections: [], topTopics: [], questionsOverTime: [], sectionHeatmap: {},
  };
}

module.exports = {
  getWorkspace, allWorkspaces, createWorkspace, verifyPasscode,
  issueToken, validateToken, revokeToken,
  saveSession, patchSessionAI, listSessions, getSession, getAnalytics,
};
