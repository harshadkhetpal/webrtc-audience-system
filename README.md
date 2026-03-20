# AudienceQ — Real-Time Live Q&A Platform

> Manage speaker queues, run live polls, translate speech in real time, and display analytics — all from a single dashboard your audience accesses instantly from any device.

---

## What It Does

AudienceQ brings structure and intelligence to live Q&A sessions at conferences, town halls, classrooms, and corporate events.

| Role | What they see |
|------|--------------|
| **Audience** | Raise hand, join queue, see wait time, react with emoji, hear translated speech |
| **Moderator** | Manage queue, run polls, push ads/videos, view live sentiment, projector display |
| **Admin** | Analytics dashboard, session history, speaker performance, feedback ratings |

---

## Features

### Audience
- Join queue by name or anonymously, with seating section
- Live queue position + estimated wait time clock
- Real-time voice translation — pick any language, hear the speaker in it
- Emoji reactions (👏 ❤️ 😂 🤔 😮)
- Pre-session question submission with upvoting
- Post-session star rating + feedback form
- PWA installable — works like a native app on mobile
- Join via 6-character code (e.g. `CONF42`) or QR code

### Moderator Dashboard
- Live queue management — reorder, skip, prioritise, set time limits
- One-click "Call next speaker"
- Live polls with real-time results
- Broadcast background video or ads to audience screens
- 3D auditorium seat heatmap (section participation visualisation)
- Live sentiment meter
- Projector mode — second-screen display for the room

### Admin Dashboard
- Aggregate analytics across all sessions
- Section participation heatmap
- Speaker performance table (total time, avg/turn, section, topics)
- Top topics & keywords word cloud
- Questions over time chart
- Feedback analytics (star ratings, recent comments)
- AI session summary (per session)
- Session comparison view
- Export speakers list as CSV

### Real-Time Voice Translation
- Speaker picks their speaking language (Hindi, Spanish, French, etc.)
- Audience picks their listening language independently
- Web Speech API → MyMemory Translation → Browser TTS
- ~2–4 second latency, 75+ language pairs
- No API key required (uses MyMemory free tier)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Socket.io-client, Agora RTC SDK |
| Backend | Node.js, Express 5, Socket.io |
| Real-time | WebSocket (Socket.io) + WebRTC (Agora) |
| Database | File-based JSON (SQLite migration planned) |
| Hosting | Vercel (frontend) + Railway (backend) |
| Translation | MyMemory API (free, no key needed) |
| 3D / Animations | CSS 3D transforms, Three.js-style canvas |

---

## Project Structure

```
webrtc-audience-system/
├── backend/
│   ├── server.js          # Express + Socket.io server, all room logic
│   ├── storage.js         # File-based persistence (workspaces, sessions, analytics)
│   ├── aiSummary.js       # AI session summary generation
│   ├── Dockerfile         # Production Docker image
│   ├── railway.toml       # Railway deployment config
│   └── data/              # Persisted session JSON files
├── frontend/
│   ├── src/
│   │   ├── App.js                        # Route switcher (landing/app/admin/projector/join)
│   │   ├── LandingPage.jsx               # 3D marketing website
│   │   ├── ModeratorDashboard.jsx        # Live session moderator UI
│   │   ├── AdminDashboard.jsx            # Analytics + session history
│   │   ├── ProjectorMode.jsx             # Second-screen projector display
│   │   ├── JoinPage.jsx                  # Join-by-code entry page
│   │   ├── Login.jsx                     # Moderator/admin authentication
│   │   └── components/
│   │       └── AudienceView.js           # Audience-facing PWA
│   ├── public/
│   │   ├── manifest.json                 # PWA manifest
│   │   └── index.html
│   └── vercel.json                       # Vercel deployment config
├── Dockerfile             # Root Docker image (serves both)
└── railway.json           # Railway root config
```

---

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/harshadkhetpal/webrtc-audience-system.git
cd webrtc-audience-system

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Run

**Terminal 1 — Backend:**
```bash
cd backend
node server.js
# Runs on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
# Runs on http://localhost:3000
```

Then open **http://localhost:3000**

---

## URL Routes

| URL | What opens |
|-----|-----------|
| `http://localhost:3000/` | Landing page (marketing website) |
| `http://localhost:3000/?mode=app` | Main app (moderator + audience) |
| `http://localhost:3000/?mode=admin` | Admin analytics dashboard |
| `http://localhost:3000/?mode=projector` | Projector / second screen |
| `http://localhost:3000/?mode=join` | Join by 6-char code |

---

## Default Credentials

| Field | Value |
|-------|-------|
| Workspace ID | `default` |
| Passcode | `admin123` |

Change via `MODERATOR_PASSCODE` environment variable on the server.

---

## Deployment

### Backend → Railway

1. Connect your GitHub repo to [Railway](https://railway.app)
2. Set **Root Directory** to `backend`
3. Add environment variables:
   ```
   PORT=3001
   NODE_ENV=production
   MODERATOR_PASSCODE=your_secure_password
   ```
4. Railway auto-deploys on every push to `main`

### Frontend → Vercel

1. Import repo at [Vercel](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   ```
   REACT_APP_BACKEND_URL=https://your-railway-url.up.railway.app
   ```
4. Vercel auto-deploys on every push to `main`

---

## Environment Variables

### Backend (`backend/.env`)
```env
PORT=3001
NODE_ENV=production
MODERATOR_PASSCODE=admin123
DATA_DIR=./data
```

### Frontend (`frontend/.env.production`)
```env
REACT_APP_BACKEND_URL=https://your-railway-url.up.railway.app
REACT_APP_AGORA_APP_ID=your_agora_app_id
```

---

## Roadmap

- [ ] SQLite / PostgreSQL database migration
- [ ] Multi-workspace signup (full SaaS auth)
- [ ] DeepL integration for higher-quality translation
- [ ] Slack / email post-session digest
- [ ] Mobile app (React Native)
- [ ] Stripe billing integration
- [ ] AI-powered question moderation
- [ ] Recording + replay

---

## License

MIT — built by [Harshad Khetpal](https://github.com/harshadkhetpal)
