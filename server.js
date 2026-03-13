const http = require('http');
const https = require('https');

const SK_KEY = process.env.SK_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY || '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';

const ENDPOINTS = {
  instagram: 'instagram/transcript',
  tiktok: 'tiktok/transcript',
  youtube: 'youtube/transcript',
  youtu: 'youtube/transcript',
};

function getPlatform(url) {
  for (const key of Object.keys(ENDPOINTS)) {
    if (url.includes(key)) return ENDPOINTS[key];
  }
  return 'instagram/transcript';
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function httpsPost(hostname, path, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    };
    const req = https.request(opts, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }

  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const videoUrl = parsed.searchParams.get('url');

  // Health/wake check
  if (!videoUrl || videoUrl === 'wake') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  try {
    // Step 1: Fetch transcript from SocialKit
    const endpoint = getPlatform(videoUrl);
    const apiUrl = `https://api.socialkit.dev/${endpoint}?access_key=${SK_KEY}&url=${encodeURIComponent(videoUrl)}`;
    const skRes = await httpsGet(apiUrl);
    const skData = JSON.parse(skRes.body);

    if (!skData.success) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: skData.error || skData.message || 'SocialKit failed' }));
      return;
    }

    const raw = skData.data?.transcript || skData.data?.text || '';
    if (!raw) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'No speech detected in video.' }));
      return;
    }

    // Step 2: Polish with Claude
    const claudeRes = await httpsPost('api.anthropic.com', '/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Clean up this raw video transcript. Fix grammar, punctuation, capitalization, and sentence structure. Remove excessive filler words like "um", "uh", "like". Keep the original meaning and voice intact. Output ONLY the cleaned transcript — no preamble.\n\n${raw}`
      }]
    }, {
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01'
    });

    const claudeData = JSON.parse(claudeRes.body);
    const polished = claudeData.content?.find(b => b.type === 'text')?.text?.trim() || raw;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, transcript: polished }));

  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: e.message }));
  }
});

server.listen(PORT, () => console.log(`✅ Proxy running on port ${PORT}`));
