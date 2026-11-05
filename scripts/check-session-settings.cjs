// Local smoke check: creates and removes its own unlinked session; never sends a WhatsApp message.
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const key = fs.readFileSync('data/.api-key', 'utf8').trim();
  const request = async (path, method = 'GET', body) => {
    // Stay below the default ten-request burst limit.
    await new Promise(resolve => setTimeout(resolve, 150));
    const response = await fetch(`http://127.0.0.1:2785/api${path}`, {
      method,
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };
  const created = await request('/sessions', 'POST', { name: `settings-check-${Date.now()}` });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.ok(id);
  try {
    const settings = {
      autoRejectCalls: true,
      callRejectMessage: 'Please send a message.',
      ignoreGroups: true,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
    };
    const enabled = await request(`/sessions/${id}/config`, 'PATCH', settings);
    assert.equal(enabled.status, 200);
    const saved = await request(`/sessions/${id}/config`);
    assert.equal('syncFullHistory' in saved.data, false);
    assert.equal((await request(`/sessions/${id}/config`, 'PATCH', { syncFullHistory: true })).status, 400);
    for (const [key, value] of Object.entries(settings)) assert.equal(saved.data[key], value);
    const db = require('better-sqlite3')('data/openwa.sqlite', { readonly: true });
    try {
      const row = db.prepare('SELECT config FROM sessions WHERE id = ?').get(id);
      assert.deepEqual(JSON.parse(row.config), settings);
    } finally {
      db.close();
    }
    console.log('All settings persisted in SQLite and returned by GET.');
    for (const key of ['ignoreGroups', 'alwaysOnline', 'readMessages', 'readStatus']) {
      assert.equal((await request(`/sessions/${id}/config`, 'PATCH', { [key]: 'yes' })).status, 400);
      assert.equal((await request(`/sessions/${id}/config`, 'PATCH', { [key]: false })).status, 200);
      assert.equal((await request(`/sessions/${id}/config`)).data[key], false);
    }
    assert.equal(
      (await request(`/sessions/${id}/config`, 'PATCH', { callRejectMessage: 'x'.repeat(4097) })).status,
      400,
    );
    console.log('Each toggle disables independently; invalid values and oversized replies rejected.');
    const reset = await request(
      `/sessions/${id}/config`,
      'PATCH',
      Object.fromEntries(Object.keys(settings).map(k => [k, null])),
    );
    assert.equal(reset.status, 200);
    assert.equal(reset.data.callRejectMessage, '');
    for (const key of Object.keys(settings).filter(k => k !== 'callRejectMessage'))
      assert.equal(reset.data[key], false);
    console.log('Null resets all settings to defaults.');
  } finally {
    assert.equal((await request(`/sessions/${id}`, 'DELETE')).status, 204);
    console.log('Removed smoke-test session.');
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
