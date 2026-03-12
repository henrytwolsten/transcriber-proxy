const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3001;
const SK_KEY = process.env.SK_KEY || 'eIU5RXepDlazCB';

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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }

  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  if (parsed.pathname !== '/transcript') {
    res.writeHead(404); res.end('Not found'); return;
  }

  const videoUrl = parsed.searchParams.get('url');
  if (!videoUrl) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url param' })); return; }

  const endpoint = getPlatform(videoUrl);
  const apiUrl = `https://api.socialkit.dev/${endpoint}?access_key=${SK_KEY}&url=${encodeURIComponent(videoUrl)}`;

  https.get(apiUrl, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => body += chunk);
    apiRes.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    });
  }).on('error', (e) => {
    res.writeHead(500);
    res.end(JSON.stringify({ success: false, error: e.message }));
  });
});

server.listen(PORT, () => console.log(`✅ Proxy running on port ${PORT}`));
