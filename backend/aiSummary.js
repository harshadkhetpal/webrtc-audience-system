/**
 * aiSummary.js — Claude-powered session summary generator.
 * Uses Node.js built-in https module (no extra dependencies).
 * Requires ANTHROPIC_API_KEY environment variable.
 */
const https = require('https');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';

function fmtDur(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function buildPrompt(session) {
  const speakers = (session.speakers || []);
  const questions = (session.preQuestions || []).slice(0, 15); // top 15 by votes
  const polls = (session.polls || []);

  const durationMin = session.startedAt && session.endedAt
    ? Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000)
    : 'unknown';

  const speakerLines = speakers.map(sp =>
    `  - ${sp.name || 'Anonymous'} (${sp.section || 'unknown section'}): "${sp.topic || 'no topic'}" — ${fmtDur(sp.durationSec || 0)}`
  ).join('\n');

  const questionLines = questions
    .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    .map(q => `  - [${q.votes || 0} votes] ${q.text} — from ${q.name || 'Anonymous'}, ${q.section || 'unknown section'}`)
    .join('\n');

  const pollLines = polls.map(p => {
    const total = p.options.reduce((s, o) => s + (o.votes || 0), 0);
    const opts = p.options.map(o => `${o.text}: ${o.votes || 0} votes (${total > 0 ? Math.round((o.votes/total)*100) : 0}%)`).join(', ');
    return `  - "${p.question}": ${opts}`;
  }).join('\n');

  return `Analyze this Q&A session and return a JSON object with exactly these keys:
- overview: string (2-3 sentences summarising what was discussed and the overall tone)
- keyQuestions: array of up to 6 strings (most significant questions raised, derived from upvoted pre-questions and speaker topics)
- dominantThemes: array of up to 5 strings (recurring topics or threads that appeared across multiple speakers)
- sectionParticipation: object mapping section name to number of speakers from that section
- factCheckFlags: array of objects { claim: string, reason: string } — flag statements that sound like unverified statistics, disputed claims, or things the organiser should verify (leave empty array if nothing notable)
- recommendations: array of up to 4 strings (suggested follow-ups or actions for the organiser based on what was raised)
- sentiment: one of "positive" | "constructive" | "mixed" | "tense" (your read of the session tone)

Session data:
- Date: ${session.endedAt || session.startedAt || 'unknown'}
- Room: ${session.roomId || 'main'}
- Duration: ~${durationMin} minutes
- Speakers (${speakers.length} total):
${speakerLines || '  (none recorded)'}

- Pre-session questions (sorted by votes):
${questionLines || '  (none submitted)'}

- Polls:
${pollLines || '  (no polls run)'}

Return ONLY the JSON object, no markdown fences or explanation.`;
}

/**
 * Generate an AI summary for a session.
 * Returns parsed JSON object, or null if AI is unavailable or fails.
 */
async function generateSummary(session) {
  if (!API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — skipping AI summary');
    return null;
  }

  const prompt = buildPrompt(session);

  const body = JSON.stringify({
    model:      'claude-opus-4-5',
    max_tokens: 1024,
    system:     'You are an expert event facilitator and analyst. You produce concise, actionable session summaries for Q&A events. Always be factual and grounded in the provided data. Respond only with valid JSON.',
    messages:   [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers:  {
        'Content-Type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.content?.[0]?.text) {
            const summary = JSON.parse(parsed.content[0].text);
            console.log(`✅ AI summary generated for session ${session.sessionId}`);
            resolve(summary);
          } else {
            console.error('AI response unexpected shape:', raw.slice(0, 300));
            resolve(null);
          }
        } catch (e) {
          console.error('AI summary parse error:', e.message, raw.slice(0, 300));
          resolve(null);
        }
      });
    });

    req.setTimeout(45000, () => {
      console.error('AI summary request timed out');
      req.destroy();
      resolve(null);
    });

    req.on('error', (e) => {
      console.error('AI summary request error:', e.message);
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { generateSummary };
