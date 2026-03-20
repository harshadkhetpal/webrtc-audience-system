// Load .env file if present (no dotenv dependency — pure Node.js)
const fs0 = require('fs'), path0 = require('path');
try {
  const envFile = path0.join(__dirname, '.env');
  if (fs0.existsSync(envFile)) {
    fs0.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    });
  }
} catch { /* .env optional */ }

const express  = require('express');
const http     = require('http');
const os       = require('os');
const crypto   = require('crypto');
const socketIo = require('socket.io');
const cors     = require('cors');
const storage  = require('./storage');
const { generateSummary } = require('./aiSummary');

// Agora token builder (optional — only active when AGORA_APP_CERTIFICATE is set)
let RtcTokenBuilder, RtcRole;
try {
  ({ RtcTokenBuilder, RtcRole } = require('agora-access-token'));
} catch { /* package missing — fall back to null token */ }

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const app    = express();
const server = http.createServer(app);

const allowedOrigin = process.env.APP_URL || '*';
const io = socketIo(server, { cors: { origin: allowedOrigin, methods: ['GET', 'POST'] } });

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// In production: serve the compiled React app from ../frontend/build
if (process.env.NODE_ENV === 'production') {
  const buildPath = path0.join(__dirname, '../frontend/build');
  app.use(express.static(buildPath));
}

// ─── Room factory ─────────────────────────────────────────────────────────────
// ─── Join code registry ───────────────────────────────────────────────────────
const joinCodes = {}; // code -> roomId

function makeJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 ambiguity
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (joinCodes[code]);
  return code;
}

function makeRoom(workspaceId = 'default') {
  return {
    workspaceId,
    sessionId:        `sess_${crypto.randomUUID()}`,
    sessionStartedAt: new Date().toISOString(),
    queue:            [],
    currentSpeaker:   null,
    queuePaused:      false,
    speakerTimeLimit: 0,          // seconds; 0 = no limit
    currentPoll:      null,       // { id, question, options:[{text,votes}], closed }
    pollVoters:       new Set(),  // socket IDs that voted in current poll
    reactions:        { agree: 0, followup: 0, same: 0 },
    preQuestions:     [],         // [{id,text,name,section,votes,voters:Set,submittedAt}]
    preSessionOpen:   true,
    speakerLog:       [],         // [{name,section,topic,durationSec,endedAt}]
    closedPolls:      [],         // archive of finished polls
    passcode:         '',         // 6-digit string; '' = no passcode required
    screeningEnabled: false,      // pre-screening mode for pre-questions
    pendingQuestions: [],         // questions awaiting moderator approval when screeningEnabled
    webhookUrl:       '',         // POST URL for webhook events
    autoAdvance:      false,      // auto-call next speaker when time limit expires
    autoAdvanceTimer: null,       // setTimeout ref (not serialized)
    speakerSocketId:  null,       // socket.id of current speaker (for whisper)
    transcript:       [],         // [{speaker, text, ts}] live transcription entries
    engagement:       { joins:0, reactions:0, questions:0, polls:0 }, // engagement counters
    speakerStartedAt: null,       // ms timestamp when current speaker was selected
    bgVideoUrl:       '',         // ambient background video URL for audience screen
    adUrl:            '',         // ad banner/image URL shown as protected overlay
    joinCode:         '',         // 6-char audience join code e.g. CONF42
    feedback:         [],         // [{stars, comment, ts}] post-session ratings
  };
}

const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = makeRoom();
    const code = makeJoinCode();
    rooms[roomId].joinCode = code;
    joinCodes[code] = roomId;
  }
  return rooms[roomId];
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────
function broadcastQueue(roomId) {
  const r = getRoom(roomId);
  io.to(`room:${roomId}`).emit('queueUpdate', {
    queue:            r.queue,
    currentSpeaker:   r.currentSpeaker,
    queuePaused:      r.queuePaused,
    speakerTimeLimit: r.speakerTimeLimit,
    reactions:        r.reactions,
    transcript:       r.transcript.slice(-20),
    pendingCount:     r.pendingQuestions.length,
    engagement:       r.engagement,
    speakerStartedAt: r.speakerStartedAt,
    bgVideoUrl:       r.bgVideoUrl,
    adUrl:            r.adUrl,
    joinCode:         r.joinCode,
  });
}

function broadcastRoomSettings(roomId) {
  const r = getRoom(roomId);
  io.to(`room:${roomId}`).emit('roomSettingsUpdate', {
    passcode:         !!r.passcode,
    screeningEnabled: r.screeningEnabled,
    autoAdvance:      r.autoAdvance,
    webhookUrl:       !!r.webhookUrl,
  });
}

function broadcastPendingQuestions(roomId) {
  const r = getRoom(roomId);
  io.to(`room:${roomId}`).emit('pendingQuestionsUpdate', {
    questions: r.pendingQuestions.map(({ voters, ...rest }) => rest),
  });
}

async function fireWebhook(roomId, eventType, data) {
  const r = getRoom(roomId);
  if (!r.webhookUrl) return;
  const body = JSON.stringify({ event: eventType, roomId, ts: Date.now(), ...data });
  try {
    fetch(r.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch { /* ignore */ }
}

function broadcastPoll(roomId) {
  const r = getRoom(roomId);
  io.to(`room:${roomId}`).emit('pollUpdate', r.currentPoll);
}

function broadcastPreQuestions(roomId) {
  const r = getRoom(roomId);
  const safe = r.preQuestions
    .map(({ voters, ...rest }) => rest)
    .sort((a, b) => b.votes - a.votes);
  io.to(`room:${roomId}`).emit('preQuestionsUpdate', {
    questions: safe,
    open: r.preSessionOpen,
  });
}

// ─── Auth middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const workspaceId = storage.validateToken(token);
  if (!workspaceId) return res.status(401).json({ error: 'Unauthorised' });
  req.workspaceId = workspaceId;
  next();
}

// ─── Session snapshot helper ─────────────────────────────────────────────────
function snapshotSession(r, roomId, endedAt = new Date().toISOString()) {
  const session = {
    sessionId:    r.sessionId,
    workspaceId:  r.workspaceId || 'default',
    roomId,
    startedAt:    r.sessionStartedAt,
    endedAt,
    speakers:     r.speakerLog,
    preQuestions: r.preQuestions.map(({ voters, ...rest }) => rest),
    polls:        r.closedPolls,
    feedback:     r.feedback || [],   // ← persist post-session ratings
    aiSummary:    null,
  };
  storage.saveSession(session);
  console.log(`💾 Session ${session.sessionId} saved (${session.speakers.length} speakers)`);

  // Fire-and-forget AI summary
  generateSummary(session).then(summary => {
    if (summary) storage.patchSessionAI(session.workspaceId, session.sessionId, summary);
  });

  return session;
}

// ─── REST: Auth ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { workspaceId, passcode } = req.body || {};
  if (!workspaceId || !passcode) return res.status(400).json({ error: 'workspaceId and passcode required' });
  const ws = storage.getWorkspace(workspaceId);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  if (!storage.verifyPasscode(workspaceId, passcode)) return res.status(401).json({ error: 'Wrong passcode' });
  const token = storage.issueToken(workspaceId);
  res.json({ token, workspaceId: ws.id, workspaceName: ws.name });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const ws = storage.getWorkspace(req.workspaceId);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ workspaceId: ws.id, workspaceName: ws.name });
});

app.delete('/api/auth/logout', requireAuth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  storage.revokeToken(token);
  res.json({ ok: true });
});

// ─── REST: Workspaces ─────────────────────────────────────────────────────────
app.post('/api/workspaces', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey) {
    const provided = req.headers['x-admin-key'] || '';
    if (provided !== adminKey) return res.status(403).json({ error: 'Admin key required' });
  }
  const { name, passcode } = req.body || {};
  if (!name?.trim() || !passcode?.trim()) return res.status(400).json({ error: 'name and passcode required' });
  const ws = storage.createWorkspace({ name: name.trim(), passcode: passcode.trim() });
  res.json({ workspaceId: ws.id, name: ws.name, createdAt: ws.createdAt });
});

app.get('/api/workspaces', requireAuth, (req, res) => {
  // Only return the caller's own workspace (unless they share the same passcode = org admin)
  const ws = storage.getWorkspace(req.workspaceId);
  res.json([ws]);
});

/// ─── REST: Join code lookup (public — no auth needed) ─────────────────────────
app.get('/api/join/:code', (req, res) => {
  const code   = (req.params.code || '').toUpperCase().trim();
  const roomId = joinCodes[code];
  if (!roomId) return res.status(404).json({ error: 'Invalid join code' });
  res.json({ roomId, joinCode: code });
});

// ─── REST: Sessions ───────────────────────────────────────────────────────────
app.get('/api/sessions', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const sessions = storage.listSessions(req.workspaceId, limit);
  res.json(sessions);
});

app.get('/api/sessions/:sessionId', (req, res) => {
  // Public endpoint — attendees can view a session summary without logging in
  // Try all workspaces to find the session (sessions share a flat namespace per-workspace)
  const all = storage.allWorkspaces();
  let session = null;
  for (const ws of all) {
    session = storage.getSession(ws.id, req.params.sessionId);
    if (session) break;
  }
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.post('/api/sessions/:sessionId/summarize', requireAuth, async (req, res) => {
  const session = storage.getSession(req.workspaceId, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true, message: 'Generating summary in background…' });
  const summary = await generateSummary(session);
  if (summary) storage.patchSessionAI(req.workspaceId, req.params.sessionId, summary);
});

// ─── REST: Publish session summary to external channels ───────────────────────
app.post('/api/sessions/:sessionId/publish', requireAuth, async (req, res) => {
  const { channel, webhookUrl, message, payload } = req.body;

  if (channel === 'slack') {
    if (!webhookUrl) return res.json({ ok: false, error: 'Missing webhookUrl' });
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: message } }] }),
      });
      return res.json({ ok: r.ok, status: r.status });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  if (channel === 'teams') {
    if (!webhookUrl) return res.json({ ok: false, error: 'Missing webhookUrl' });
    try {
      const body = payload || { type: 'message', text: message };
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json({ ok: r.ok, status: r.status });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  }

  res.json({ ok: false, error: 'Unknown channel' });
});

// ─── REST: Analytics ──────────────────────────────────────────────────────────
app.get('/api/analytics', requireAuth, (req, res) => {
  const since = req.query.since || null;
  const data  = storage.getAnalytics(req.workspaceId, since);
  res.json(data);
});

// ─── REST: Agora Token ────────────────────────────────────────────────────────
// Generates a fresh RTC token for the given channel + uid.
// If AGORA_APP_CERTIFICATE is not set, returns null (works for Agora apps in
// "Testing Mode" / no-certificate mode in the Agora Console).
app.get('/api/agora/token', (req, res) => {
  const appId       = process.env.AGORA_APP_ID       || 'fba8fe738d9049b2a1eb9534d038ae97';
  const certificate = process.env.AGORA_APP_CERTIFICATE || '';
  const channel     = (req.query.channel || 'main-room').slice(0, 64);
  const uid         = parseInt(req.query.uid, 10) || 0;
  const expiryS     = 3600; // 1-hour tokens

  if (!certificate || !RtcTokenBuilder) {
    // No certificate configured → return null so Agora uses no-auth mode
    console.log(`[Agora] Issuing null token for channel=${channel} uid=${uid} (no certificate set)`);
    return res.json({ token: null, channel, uid, expiresAt: null });
  }

  try {
    const expireTs = Math.floor(Date.now() / 1000) + expiryS;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, certificate, channel, uid,
      RtcRole.PUBLISHER, expireTs
    );
    console.log(`[Agora] Fresh token issued for channel=${channel} uid=${uid} expires=${expireTs}`);
    res.json({ token, channel, uid, expiresAt: new Date((Math.floor(Date.now() / 1000) + expiryS) * 1000).toISOString() });
  } catch (err) {
    console.error('[Agora] Token build error:', err.message);
    res.status(500).json({ error: 'Token generation failed', detail: err.message });
  }
});

// ─── Socket connection ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let roomId = 'main';
  console.log('✅ Connected:', socket.id);

  function joinSocketRoom(newRoomId) {
    socket.leave(`room:${roomId}`);
    roomId = newRoomId || 'main';
    socket.join(`room:${roomId}`);
  }

  // Client declares which room they belong to
  socket.on('joinRoom', (data) => {
    const id = (data?.roomId || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'main';
    // Track workspace for session attribution
    const wsId = (data?.workspaceId || 'default').slice(0, 40);
    const r0 = getRoom(id);
    if (r0.workspaceId === 'default' && wsId !== 'default') r0.workspaceId = wsId;
    // Passcode check
    if (r0.passcode && data?.passcode !== r0.passcode) {
      socket.emit('joinError', { error: 'Wrong room passcode' });
      return;
    }
    joinSocketRoom(id);
    const r = getRoom(roomId);
    socket.emit('queueUpdate', {
      queue: r.queue, currentSpeaker: r.currentSpeaker,
      queuePaused: r.queuePaused, speakerTimeLimit: r.speakerTimeLimit,
      reactions: r.reactions, transcript: r.transcript.slice(-20),
      pendingCount: r.pendingQuestions.length, engagement: r.engagement,
    });
    socket.emit('pollUpdate', r.currentPoll);
    const safeQs = r.preQuestions
      .map(({ voters, ...rest }) => rest)
      .sort((a, b) => b.votes - a.votes);
    socket.emit('preQuestionsUpdate', { questions: safeQs, open: r.preSessionOpen });
    socket.emit('roomSettingsUpdate', {
      passcode: !!r.passcode, screeningEnabled: r.screeningEnabled,
      autoAdvance: r.autoAdvance, webhookUrl: !!r.webhookUrl,
    });
  });

  // Join default room and send current state
  joinSocketRoom('main');
  const initRoom = getRoom('main');
  socket.emit('queueUpdate', {
    queue: initRoom.queue, currentSpeaker: initRoom.currentSpeaker,
    queuePaused: initRoom.queuePaused, speakerTimeLimit: initRoom.speakerTimeLimit,
    reactions: initRoom.reactions, transcript: initRoom.transcript.slice(-20),
    pendingCount: initRoom.pendingQuestions.length, engagement: initRoom.engagement,
  });
  socket.emit('pollUpdate', initRoom.currentPoll);

  // ── Queue ──────────────────────────────────────────────────────────────────
  socket.on('joinQueue', (data) => {
    const r = getRoom(roomId);
    if (r.queuePaused) {
      socket.emit('queueUpdate', {
        queue: r.queue, currentSpeaker: r.currentSpeaker,
        queuePaused: true, speakerTimeLimit: r.speakerTimeLimit, reactions: r.reactions,
      });
      return;
    }
    // Remove if already in queue (re-join)
    r.queue = r.queue.filter(p => p.id !== socket.id);

    const person = {
      id:          socket.id,
      name:        data.anonymous ? null : (data.name || null),
      anonymous:   !!data.anonymous,
      section:     data.section,
      topic:       data.topic || null,
      coords:      data.coords || null,
      gpsVerified: !!data.coords,
      priority:    false,
      textOnly:    data.textOnly || false,
      joinedAt:    new Date().toISOString(),
      startedAt:   null, // filled when selected to speak
      srcLangMM:   (data.srcLangMM  || 'en').slice(0, 5),  // MyMemory code e.g. 'hi'
      srcLangSTT:  (data.srcLangSTT || 'en-US').slice(0, 10), // STT code e.g. 'hi-IN'
    };
    r.queue.push(person);
    r.engagement.joins++;
    const label = person.anonymous ? 'Anonymous' : person.name;
    console.log(`👋 ${label} from ${data.section} joined room:${roomId}. Queue: ${r.queue.length}${person.gpsVerified ? ' [GPS]' : ''}`);
    broadcastQueue(roomId);
  });

  socket.on('leaveQueue', () => {
    const r = getRoom(roomId);
    const person = r.queue.find(p => p.id === socket.id);
    r.queue = r.queue.filter(p => p.id !== socket.id);
    if (person) console.log(`👋 ${person.name || 'Anonymous'} left queue`);
    broadcastQueue(roomId);
  });

  socket.on('getQueueState', () => {
    const r = getRoom(roomId);
    socket.emit('queueUpdate', {
      queue: r.queue, currentSpeaker: r.currentSpeaker,
      queuePaused: r.queuePaused, speakerTimeLimit: r.speakerTimeLimit, reactions: r.reactions,
    });
  });

  socket.on('selectSpeaker', (data) => {
    const r = getRoom(roomId);
    const speaker = r.queue.find(p => p.id === data.userId);
    if (speaker) {
      // Clear existing auto-advance timer
      if (r.autoAdvanceTimer) { clearTimeout(r.autoAdvanceTimer); r.autoAdvanceTimer = null; }
      speaker.startedAt    = Date.now();
      r.speakerStartedAt   = Date.now();
      r.currentSpeaker     = speaker;
      r.speakerSocketId = data.userId;
      r.queue           = r.queue.filter(p => p.id !== data.userId);
      r.reactions       = { agree: 0, followup: 0, same: 0 };
      const label = speaker.anonymous ? 'Anonymous' : speaker.name;
      console.log(`🎤 ${label} selected to speak in room:${roomId}`);
      io.to(data.userId).emit('youAreNext', { timeLimit: r.speakerTimeLimit });
      fireWebhook(roomId, 'speaker.start', { speaker: label });
      // Auto-advance timer
      if (r.autoAdvance && r.speakerTimeLimit > 0) {
        r.autoAdvanceTimer = setTimeout(() => {
          const rr = getRoom(roomId);
          if (!rr.currentSpeaker) return;
          const endedId = rr.currentSpeaker.id;
          io.to(endedId).emit('turnEnded');
          _logSpeaker(rr);
          fireWebhook(roomId, 'speaker.end', { speaker: rr.currentSpeaker.name || 'Anonymous' });
          rr.currentSpeaker = null;
          rr.speakerSocketId = null;
          rr.autoAdvanceTimer = null;
          broadcastQueue(roomId);
          // Call next if available
          if (rr.queue.length > 0) {
            const next = rr.queue[0];
            next.startedAt = Date.now();
            rr.currentSpeaker = next;
            rr.speakerSocketId = next.id;
            rr.queue = rr.queue.slice(1);
            rr.reactions = { agree: 0, followup: 0, same: 0 };
            io.to(next.id).emit('youAreNext', { timeLimit: rr.speakerTimeLimit });
            fireWebhook(roomId, 'speaker.start', { speaker: next.name || 'Anonymous' });
            if (rr.autoAdvance && rr.speakerTimeLimit > 0) {
              rr.autoAdvanceTimer = setTimeout(() => {
                const rrr = getRoom(roomId);
                if (!rrr.currentSpeaker) return;
                const eid = rrr.currentSpeaker.id;
                io.to(eid).emit('turnEnded');
                _logSpeaker(rrr);
                rrr.currentSpeaker = null;
                rrr.speakerSocketId = null;
                rrr.autoAdvanceTimer = null;
                broadcastQueue(roomId);
              }, rr.speakerTimeLimit * 1000);
            }
            broadcastQueue(roomId);
          }
        }, r.speakerTimeLimit * 1000);
      }
      broadcastQueue(roomId);
    }
  });

  socket.on('finishedSpeaking', () => {
    const r = getRoom(roomId);
    if (r.currentSpeaker && r.currentSpeaker.id === socket.id) {
      if (r.autoAdvanceTimer) { clearTimeout(r.autoAdvanceTimer); r.autoAdvanceTimer = null; }
      _logSpeaker(r);
      fireWebhook(roomId, 'speaker.end', { speaker: r.currentSpeaker.name || 'Anonymous' });
      console.log(`✅ ${r.currentSpeaker.name || 'Anonymous'} finished speaking`);
      r.currentSpeaker = null;
      r.speakerSocketId = null;
      broadcastQueue(roomId);
    }
  });

  socket.on('endSpeaker', (data) => {
    const r = getRoom(roomId);
    if (data.userId) {
      if (r.autoAdvanceTimer) { clearTimeout(r.autoAdvanceTimer); r.autoAdvanceTimer = null; }
      io.to(data.userId).emit('turnEnded');
      if (r.currentSpeaker && r.currentSpeaker.id === data.userId) {
        _logSpeaker(r);
        fireWebhook(roomId, 'speaker.end', { speaker: r.currentSpeaker.name || 'Anonymous' });
        console.log(`⏹️ Moderator ended ${r.currentSpeaker.name || 'Anonymous'}'s turn`);
        r.currentSpeaker = null;
        r.speakerSocketId = null;
      }
      broadcastQueue(roomId);
    }
  });

  function _logSpeaker(r) {
    if (!r.currentSpeaker) return;
    const durSec = r.currentSpeaker.startedAt
      ? Math.round((Date.now() - r.currentSpeaker.startedAt) / 1000)
      : 0;
    r.speakerLog.push({
      name:        r.currentSpeaker.name || 'Anonymous',
      section:     r.currentSpeaker.section || '',
      topic:       r.currentSpeaker.topic   || '',
      durationSec: durSec,
      endedAt:     new Date().toISOString(),
    });
  }

  socket.on('moveToEnd', (data) => {
    const r = getRoom(roomId);
    const idx = r.queue.findIndex(p => p.id === data.userId);
    if (idx !== -1) {
      const [person] = r.queue.splice(idx, 1);
      person.priority = false;
      r.queue.push(person);
      broadcastQueue(roomId);
    }
  });

  // ⭐ Priority Queue
  socket.on('prioritizeUser', (data) => {
    const r = getRoom(roomId);
    const idx = r.queue.findIndex(p => p.id === data.userId);
    if (idx !== -1) {
      const [person] = r.queue.splice(idx, 1);
      person.priority = !person.priority;
      if (person.priority) {
        // Find insert point: after last existing priority person
        const lastPri = r.queue.reduce((acc, p, i) => (p.priority ? i : acc), -1);
        r.queue.splice(lastPri + 1, 0, person);
      } else {
        r.queue.push(person);
      }
      broadcastQueue(roomId);
    }
  });

  socket.on('setQueuePaused', (paused) => {
    const r = getRoom(roomId);
    r.queuePaused = !!paused;
    broadcastQueue(roomId);
  });

  socket.on('clearQueue', () => {
    const r = getRoom(roomId);
    if (r.autoAdvanceTimer) { clearTimeout(r.autoAdvanceTimer); r.autoAdvanceTimer = null; }
    r.queue = [];
    console.log(`🗑️ Queue cleared in room:${roomId}`);
    broadcastQueue(roomId);
  });

  // ── End Session (saves to disk + triggers AI summary) ─────────────────────
  socket.on('endSession', () => {
    const r = getRoom(roomId);
    if (r.autoAdvanceTimer) { clearTimeout(r.autoAdvanceTimer); r.autoAdvanceTimer = null; }
    if (r.currentSpeaker) { _logSpeaker(r); r.currentSpeaker = null; }
    r.speakerSocketId = null;
    // Top contributor: find preQuestion with most votes
    if (r.preQuestions.length > 0) {
      const top = r.preQuestions.reduce((a, b) => ((b.votes||0) > (a.votes||0) ? b : a));
      if ((top.votes||0) > 0 && top.submittedBy) {
        io.to(top.submittedBy).emit('topContributor');
      }
    }
    fireWebhook(roomId, 'session.end', {});
    const savedSession = snapshotSession(r, roomId);
    // Reset room to a fresh session (same room, new session ID)
    rooms[roomId] = makeRoom(r.workspaceId);
    io.to(`room:${roomId}`).emit('sessionEnded', { sessionId: savedSession.sessionId });
    broadcastQueue(roomId);
    broadcastPreQuestions(roomId);
    console.log(`📦 Session ended in room:${roomId}`);
  });

  socket.on('updateLocation', (data) => {
    const r = getRoom(roomId);
    const isSpeaker = !!(r.currentSpeaker && r.currentSpeaker.id === socket.id);
    const inQueue   = r.queue.find(p => p.id === socket.id);
    let changed = false;

    if (inQueue) {
      inQueue.coords      = data.coords || inQueue.coords;
      if (data.section) inQueue.section = data.section;
      inQueue.gpsVerified = true;
      changed = true;
    }
    if (isSpeaker) {
      r.currentSpeaker.coords = data.coords || r.currentSpeaker.coords;
      if (data.section) r.currentSpeaker.section = data.section;
      r.currentSpeaker.gpsVerified = true;
      changed = true;
    }

    if (changed) {
      // Full queue broadcast (keeps queue list & speaker card in sync)
      broadcastQueue(roomId);

      // Lightweight event — lets the moderator map pin update instantly
      // without deserialising the whole queue on every GPS tick
      io.to(`room:${roomId}`).emit('locationUpdate', {
        userId:    socket.id,
        coords:    data.coords,
        section:   data.section,
        isSpeaker,
        name: isSpeaker
          ? (r.currentSpeaker.name || 'Anonymous')
          : (inQueue?.name || 'Anonymous'),
      });

      if (isSpeaker) {
        const sec = data.section || r.currentSpeaker.section || '?';
        const acc = data.coords?.accuracy ? ` ±${data.coords.accuracy}m` : '';
        console.log(`📍 Speaker GPS update in room:${roomId} → ${sec}${acc}`);
      }
    }
  });

  // ── Polls ──────────────────────────────────────────────────────────────────
  socket.on('createPoll', (data) => {
    const r = getRoom(roomId);
    r.currentPoll = {
      id:        Date.now(),
      question:  data.question || 'Quick poll',
      options:   (data.options || []).filter(Boolean).map(t => ({ text: t, votes: 0 })),
      closed:    false,
      createdAt: new Date().toISOString(),
    };
    r.pollVoters = new Set();
    r.engagement.polls++;
    console.log(`📊 Poll created in room:${roomId}: "${r.currentPoll.question}"`);
    fireWebhook(roomId, 'poll.create', { question: r.currentPoll.question });
    broadcastPoll(roomId);
  });

  socket.on('submitVote', (data) => {
    const r = getRoom(roomId);
    if (!r.currentPoll || r.currentPoll.closed) return;
    if (r.pollVoters.has(socket.id)) { socket.emit('voteConfirmed', { alreadyVoted: true }); return; }
    const opt = r.currentPoll.options[data.optionIndex];
    if (opt) {
      opt.votes++;
      r.pollVoters.add(socket.id);
      socket.emit('voteConfirmed', { optionIndex: data.optionIndex });
      broadcastPoll(roomId);
    }
  });

  socket.on('closePoll', () => {
    const r = getRoom(roomId);
    if (r.currentPoll) {
      r.currentPoll.closed = true;
      // Archive a clean copy (no Set fields)
      r.closedPolls.push({ ...r.currentPoll });
      broadcastPoll(roomId);
    }
  });

  socket.on('clearPoll', () => {
    const r = getRoom(roomId);
    r.currentPoll = null;
    broadcastPoll(roomId);
  });

  // ── Reactions ──────────────────────────────────────────────────────────────
  socket.on('sendReaction', (data) => {
    const r = getRoom(roomId);
    if (!r.currentSpeaker) return;
    const type = data.type;
    if (type === 'agree' || type === 'followup' || type === 'same') {
      r.reactions[type]++;
      r.engagement.reactions++;
      broadcastQueue(roomId); // reactions piggyback on queueUpdate
    }
  });

  // ── Time limit ─────────────────────────────────────────────────────────────
  socket.on('setTimeLimit', (data) => {
    const r = getRoom(roomId);
    r.speakerTimeLimit = Math.max(0, parseInt(data.seconds, 10) || 0);
    io.to(`room:${roomId}`).emit('timeLimitUpdate', { seconds: r.speakerTimeLimit });
    console.log(`⏱ Time limit = ${r.speakerTimeLimit}s in room:${roomId}`);
  });

  // ── Pre-session questions ──────────────────────────────────────────────────
  socket.on('submitQuestion', (data) => {
    const r = getRoom(roomId);
    if (!r.preSessionOpen) return;
    if (!data.text?.trim()) return;
    const question = {
      id:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text:        data.text.trim().slice(0, 280),
      name:        data.name || 'Anonymous',
      section:     data.section || '',
      votes:       0,
      voters:      new Set(),
      submittedBy: socket.id,
      submittedAt: new Date().toISOString(),
    };
    r.engagement.questions++;
    if (r.screeningEnabled) {
      r.pendingQuestions.push(question);
      console.log(`💬 Pre-question pending screening in room:${roomId}`);
      broadcastPendingQuestions(roomId);
    } else {
      r.preQuestions.push(question);
      console.log(`💬 Pre-question submitted in room:${roomId}`);
      broadcastPreQuestions(roomId);
    }
  });

  socket.on('approveQuestion', ({ id }) => {
    const r = getRoom(roomId);
    const idx = r.pendingQuestions.findIndex(q => q.id === id);
    if (idx !== -1) {
      const [q] = r.pendingQuestions.splice(idx, 1);
      r.preQuestions.push(q);
      broadcastPendingQuestions(roomId);
      broadcastPreQuestions(roomId);
    }
  });

  socket.on('rejectQuestion', ({ id }) => {
    const r = getRoom(roomId);
    r.pendingQuestions = r.pendingQuestions.filter(q => q.id !== id);
    broadcastPendingQuestions(roomId);
  });

  socket.on('toggleScreening', ({ enabled }) => {
    const r = getRoom(roomId);
    r.screeningEnabled = !!enabled;
    broadcastRoomSettings(roomId);
  });

  socket.on('setRoomPasscode', ({ passcode }) => {
    const r = getRoom(roomId);
    r.passcode = (passcode || '').slice(0, 20);
    broadcastRoomSettings(roomId);
  });

  socket.on('setWebhookUrl', ({ url }) => {
    const r = getRoom(roomId);
    r.webhookUrl = url || '';
    broadcastRoomSettings(roomId);
  });

  socket.on('setBgVideo', ({ url }) => {
    const r = getRoom(roomId);
    r.bgVideoUrl = (url || '').trim();
    broadcastQueue(roomId);
  });

  socket.on('setAd', ({ url }) => {
    const r = getRoom(roomId);
    r.adUrl = (url || '').trim();
    broadcastQueue(roomId);
  });

  socket.on('submitFeedback', ({ stars, comment }) => {
    const r = getRoom(roomId);
    const s = Math.min(5, Math.max(1, Math.round(Number(stars) || 3)));
    r.feedback.push({ stars: s, comment: (comment || '').slice(0, 300).trim(), ts: Date.now() });
    // Echo count back to this socket so the UI can confirm
    socket.emit('feedbackAck', { total: r.feedback.length });
  });

  socket.on('setAutoAdvance', ({ enabled }) => {
    const r = getRoom(roomId);
    r.autoAdvance = !!enabled;
    broadcastRoomSettings(roomId);
  });

  socket.on('whisperSpeaker', ({ message }) => {
    const r = getRoom(roomId);
    if (r.speakerSocketId && message) {
      io.to(r.speakerSocketId).emit('whisperMessage', { message, from: 'Moderator', ts: Date.now() });
    }
  });

  socket.on('randomPick', () => {
    const r = getRoom(roomId);
    if (r.queue.length === 0) return;
    const idx = Math.floor(Math.random() * r.queue.length);
    const [picked] = r.queue.splice(idx, 1);
    r.queue.unshift(picked);
    broadcastQueue(roomId);
  });

  socket.on('transcriptChunk', ({ text }) => {
    const r = getRoom(roomId);
    if (!r.currentSpeaker) return;
    r.transcript.push({ speaker: r.currentSpeaker.name || 'Anonymous', text, ts: Date.now() });
    if (r.transcript.length > 500) r.transcript = r.transcript.slice(-500);
    io.to(`room:${roomId}`).emit('transcriptUpdate', { transcript: r.transcript.slice(-20) });
  });

  socket.on('upvoteQuestion', (data) => {
    const r = getRoom(roomId);
    const q = r.preQuestions.find(q => q.id === data.id);
    if (q && !q.voters.has(socket.id)) {
      q.votes++;
      q.voters.add(socket.id);
      broadcastPreQuestions(roomId);
    }
  });

  socket.on('deleteQuestion', (data) => {
    const r = getRoom(roomId);
    r.preQuestions = r.preQuestions.filter(q => q.id !== data.id);
    broadcastPreQuestions(roomId);
  });

  socket.on('setPreSessionOpen', (data) => {
    const r = getRoom(roomId);
    r.preSessionOpen = !!data.open;
    broadcastPreQuestions(roomId);
  });

  socket.on('clearPreQuestions', () => {
    const r = getRoom(roomId);
    r.preQuestions = [];
    broadcastPreQuestions(roomId);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
    const r = getRoom(roomId);
    r.queue = r.queue.filter(p => p.id !== socket.id);
    if (r.currentSpeaker && r.currentSpeaker.id === socket.id) {
      if (r.autoAdvanceTimer) { clearTimeout(r.autoAdvanceTimer); r.autoAdvanceTimer = null; }
      _logSpeaker(r);
      console.log(`❌ Speaker ${r.currentSpeaker.name || 'Anonymous'} disconnected`);
      r.currentSpeaker = null;
      r.speakerSocketId = null;
    }
    broadcastQueue(roomId);
  });
});

// ─── REST: AI features ────────────────────────────────────────────────────────
// Group similar pre-session questions using Claude
app.post('/api/ai/group-questions', requireAuth, async (req, res) => {
  const { questions } = req.body || {};
  if (!questions?.length) return res.json({ groups: [] });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ groups: [], error: 'ANTHROPIC_API_KEY not set' });

  const prompt = `Group these Q&A session questions into clusters by theme. Return ONLY a JSON array where each element is: { theme: string, emoji: string, questions: string[] }. Use 2-6 groups max. Questions:\n${questions.map((q,i) => `${i+1}. ${q.text}`).join('\n')}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:1024,
        system: 'Return only valid JSON, no markdown fences.',
        messages:[{ role:'user', content:prompt }] }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json();
    const groups = JSON.parse(data.content[0].text);
    res.json({ groups });
  } catch(e) { res.json({ groups:[], error: e.message }); }
});

// Live fact-check a transcript snippet
app.post('/api/ai/fact-check', requireAuth, async (req, res) => {
  const { text, speaker } = req.body || {};
  if (!text?.trim()) return res.json({ flags: [] });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ flags: [], error: 'ANTHROPIC_API_KEY not set' });

  const prompt = `Review this statement from "${speaker || 'a speaker'}" for any claims that should be fact-checked or verified:\n\n"${text}"\n\nReturn ONLY a JSON array of objects: { claim: string, concern: string, severity: "low"|"medium"|"high" }. If nothing needs checking, return [].`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:512,
        system: 'You are a fact-checking assistant. Return only valid JSON arrays, no markdown.',
        messages:[{ role:'user', content:prompt }] }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    const flags = JSON.parse(data.content[0].text);
    res.json({ flags: Array.isArray(flags) ? flags : [] });
  } catch(e) { res.json({ flags:[], error: e.message }); }
});

// ─── REST endpoints ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    rooms: Object.keys(rooms).map(id => ({
      id,
      queueLength: rooms[id].queue.length,
      currentSpeaker: rooms[id].currentSpeaker?.name || null,
    })),
    timestamp: new Date().toISOString(),
  });
});

app.get('/stats', (req, res) => {
  const roomId = req.query.room || 'main';
  const r = getRoom(roomId);
  res.json({ queue: r.queue, currentSpeaker: r.currentSpeaker, totalInQueue: r.queue.length });
});

// CSV export for speaker log
app.get('/api/export/speakers', (req, res) => {
  const roomId = req.query.room || 'main';
  const r = getRoom(roomId);
  const rows = [
    'Name,Section,Topic,Duration (sec),Ended At',
    ...r.speakerLog.map(s =>
      [`"${s.name}"`, `"${s.section}"`, `"${s.topic.replace(/"/g, '""')}"`, s.durationSec, `"${s.endedAt}"`].join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="speakers-${roomId}-${Date.now()}.csv"`);
  res.send(rows.join('\n'));
});

app.get('/api/config', (req, res) => {
  const base = process.env.APP_URL || `http://${getLocalIP()}:${process.env.PORT || 3001}`;
  res.json({ audienceUrl: base });
});

// ─── Production catch-all: send index.html for any non-API route ──────────────
// Express 5 requires named wildcard — /{*path} instead of bare *
if (process.env.NODE_ENV === 'production') {
  const buildPath = path0.join(__dirname, '../frontend/build');
  app.get('/{*path}', (req, res) => res.sendFile(path0.join(buildPath, 'index.html')));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const base = process.env.APP_URL || `http://localhost:${PORT}`;
  console.log(`\n🚀  Server running on port ${PORT}`);
  console.log(`🌐  App URL      : ${base}`);
  console.log(`📊  Health check : ${base}/health`);
  console.log(`📁  Speaker log  : ${base}/api/export/speakers\n`);
});
