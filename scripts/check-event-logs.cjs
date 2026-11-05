const fs = require('node:fs');
const assert = require('node:assert/strict');
const key = fs.readFileSync('data/.api-key', 'utf8').trim();
async function request(path, method = 'GET', body, auth = true) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const response = await fetch('http://127.0.0.1:2785/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-API-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
(async () => {
  assert.equal((await request('/logs', 'GET', undefined, false)).status, 401);
  for (const query of [
    'limit=201',
    'sortBy=metadata',
    'sortOrder=INVALID',
    'startDate=not-a-date',
    'offset=-1',
    'startDate=2027-01-01&endDate=2026-01-01',
  ]) {
    assert.equal((await request('/logs?' + query)).status, 400);
  }
  const sessions = await request('/sessions');
  const session = sessions.data.find(row => row.engineLoaded && row.status === 'ready');
  assert.ok(session, 'A connected local WhatsApp session is required.');
  const secret = fs.readFileSync('data/.webhook-log-test-secret', 'utf8').trim();
  const webhooks = await request('/sessions/' + session.id + '/webhooks');
  let webhook = webhooks.data.find(row => row.url === 'http://127.0.0.1:2791/ok');
  if (!webhook) {
    const created = await request('/sessions/' + session.id + '/webhooks', 'POST', {
      url: 'http://127.0.0.1:2791/ok',
      events: ['*'],
      secret,
      retryCount: 2,
    });
    assert.equal(created.status, 201);
    webhook = created.data;
  }
  const probe = await request('/sessions/' + session.id + '/webhooks/' + webhook.id + '/test', 'POST', {});
  assert.equal(probe.data.success, true);
  assert.equal(probe.data.statusCode, 200);
  const success = await request('/logs?source=webhook&event=test&webhookId=' + webhook.id);
  const delivered = success.data.data.find(row => row.metadata.outcome === 'delivered');
  assert.ok(delivered);
  const receiverEvents = await (await fetch('http://127.0.0.1:2791/events')).json();
  assert.ok(receiverEvents.some(event => event.deliveryId === delivered.metadata.deliveryId && event.signed));
  assert.equal((await request('/logs?deliveryId=' + delivered.metadata.deliveryId)).data.total, 3);
  const first = await request('/logs?limit=1&sortOrder=ASC');
  const next = await request('/logs?limit=1&offset=1&sortOrder=ASC');
  assert.notEqual(first.data.data[0].id, next.data.data[0].id);
  assert.equal((await request('/logs?search=' + encodeURIComponent(delivered.metadata.deliveryId))).data.total, 3);
  const failedHook = await request('/sessions/' + session.id + '/webhooks', 'POST', {
    url: 'http://127.0.0.1:2791/fail',
    events: ['*'],
    secret,
    retryCount: 1,
  });
  assert.equal(failedHook.status, 201);
  try {
    const failed = await request('/sessions/' + session.id + '/webhooks/' + failedHook.data.id + '/test', 'POST', {});
    assert.equal(failed.data.success, false);
    const failures = await request('/logs?source=webhook&outcome=failed&webhookId=' + failedHook.data.id);
    assert.equal(failures.data.data[0].statusCode, 503);
  } finally {
    await request('/sessions/' + session.id + '/webhooks/' + failedHook.data.id, 'DELETE');
  }
  fs.writeFileSync(
    'data/event-log-smoke-result.json',
    JSON.stringify(
      {
        sessionId: session.id,
        webhookId: webhook.id,
        deliveryId: delivered.metadata.deliveryId,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: authentication, query validation, signed receiver delivery, success/failure logs, correlation, search, sorting and pagination.',
  );
  console.log('Wildcard local test webhook is active for live event verification.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
