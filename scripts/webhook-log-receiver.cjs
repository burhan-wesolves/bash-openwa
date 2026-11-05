// Local-only webhook receiver for checking log correlation. Stores metadata, never event bodies.
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const secretPath = 'data/.webhook-log-test-secret';
if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const secret = fs.readFileSync(secretPath, 'utf8').trim();
const events = [];
http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/events') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(events));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    req.setEncoding('utf8');
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) req.destroy();
      else body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const signed =
          req.headers['x-openwa-signature'] ===
          'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
        const statusCode = signed ? (req.url === '/fail' ? 503 : 200) : 401;
        const entry = {
          receivedAt: new Date().toISOString(),
          event: payload.event,
          sessionId: payload.sessionId,
          deliveryId: payload.deliveryId,
          signed,
          statusCode,
        };
        events.push(entry);
        if (events.length > 100) events.shift();
        fs.appendFileSync('data/webhook-log-receiver.jsonl', JSON.stringify(entry) + '\n');
        res.writeHead(statusCode);
        res.end('ok');
      } catch {
        res.writeHead(400);
        res.end('invalid payload');
      }
    });
  })
  .listen(2791, '127.0.0.1', () => console.log('Local webhook receiver listening on 127.0.0.1:2791'));
