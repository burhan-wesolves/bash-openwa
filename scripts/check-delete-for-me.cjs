// Live local smoke test. Sends clearly labeled messages only to the connected account itself,
// then deletes only those fixtures for me. Never retracts a message for everyone.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const key = fs.readFileSync('data/.api-key', 'utf8').trim();
const db = require('better-sqlite3')('data/openwa.sqlite', { readonly: true });
async function request(path, method = 'GET', body, authenticated = true, form = false) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const response = await fetch('http://127.0.0.1:2785/api' + path, {
    method,
    headers: {
      ...(authenticated ? { 'X-API-Key': key } : {}),
      'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
    },
    body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
const raw = (sessionId, messageId) => {
  const row = db
    .prepare('SELECT serializedMessage FROM baileys_stored_messages WHERE sessionId=? AND waMessageId=?')
    .get(sessionId, messageId);
  return row ? JSON.parse(row.serializedMessage) : null;
};

(async () => {
  const sessions = await request('/sessions');
  const session = sessions.data.find(row => row.status === 'ready' && row.engineLoaded && row.phone);
  assert.ok(session, 'A connected local WhatsApp session is required.');
  const chatId = session.phone.replace(/\D/g, '') + '@c.us';
  const prefix = '/sessions/' + session.id + '/messages';
  const unknown = 'delete-check-missing-' + randomUUID();
  const fixture = { chatId, messageId: unknown, forEveryone: false };
  assert.equal((await request(prefix + '/delete', 'POST', fixture, false)).status, 401);
  for (const value of [null, 'FALSE', 'yes', '', 0, 1, [], {}]) {
    assert.equal((await request(prefix + '/delete', 'POST', { ...fixture, forEveryone: value })).status, 400);
  }
  assert.equal((await request(prefix + '/delete', 'POST', { chatId, forEveryone: false })).status, 400);
  assert.equal((await request(prefix + '/delete', 'POST', { messageId: unknown, forEveryone: false })).status, 404);
  assert.equal((await request(prefix + '/delete', 'POST', fixture)).status, 404);
  console.log('PASS: authentication, required fields, missing message, and strict mode validation (including null).');

  // Re-delete only the fixture created by the earlier reproduction, if it exists.
  if (fs.existsSync('data/delete-for-me-repro.json')) {
    const previous = JSON.parse(fs.readFileSync('data/delete-for-me-repro.json', 'utf8'));
    if (previous.sessionId === session.id && previous.chatId === chatId && raw(session.id, previous.messageId)) {
      assert.equal(
        (await request(prefix + '/delete', 'POST', { chatId, messageId: previous.messageId, forEveryone: false }))
          .status,
        200,
      );
      assert.equal(raw(session.id, previous.messageId).message, null);
    }
  }

  for (const mode of ['json', 'form', 'message-id-only']) {
    const form = mode === 'form';
    const sent = await request(prefix + '/send-text', 'POST', {
      chatId,
      text: '[OpenWA delete-for-me isolated self-test] ' + randomUUID(),
    });
    assert.equal(sent.status, 201);
    const messageId = sent.data.messageId;
    assert.ok(messageId);
    assert.ok(raw(session.id, messageId)?.message);
    assert.equal(
      (await request(prefix + '/delete', 'POST', { chatId: '000000000000@c.us', messageId, forEveryone: false }))
        .status,
      404,
    );
    assert.ok(raw(session.id, messageId).message, 'Wrong-chat deletion modified the original.');
    const deleted = await request(
      prefix + '/delete',
      'POST',
      { ...(mode === 'message-id-only' ? {} : { chatId }), messageId, forEveryone: form ? 'false' : false },
      true,
      form,
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.success, true);
    const stored = raw(session.id, messageId);
    assert.equal(stored.message, null);
    assert.ok(stored.key?.id, 'Keep the key for repeat local deletions.');
    const projected = db
      .prepare('SELECT body, type, metadata FROM messages WHERE sessionId=? AND waMessageId=?')
      .get(session.id, messageId);
    assert.equal(projected.type, 'revoked');
    assert.ok(!projected.body);
    assert.equal(projected.metadata, null);
    assert.equal(
      (
        await request(prefix + '/reply', 'POST', {
          chatId,
          quotedMessageId: messageId,
          text: 'This should not be sent.',
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(prefix + '/forward', 'POST', { fromChatId: chatId, toChatId: chatId, messageId })).status,
      404,
    );
    assert.equal((await request(prefix + '/react', 'POST', { chatId, messageId, emoji: '👍' })).status, 404);
    assert.equal((await request(prefix + '/delete', 'POST', { chatId, messageId, forEveryone: false })).status, 200);
    console.log('PASS: ' + mode + ', wrong-chat protection, raw/neutral cleanup, blocked reuse, and repeat delete.');
  }
  const created = await request('/sessions', 'POST', { name: 'delete-check-' + randomUUID() });
  assert.equal(created.status, 201);
  try {
    assert.equal((await request('/sessions/' + created.data.id + '/messages/delete', 'POST', fixture)).status, 400);
  } finally {
    assert.equal((await request('/sessions/' + created.data.id, 'DELETE')).status, 204);
  }
  console.log('PASS: inactive session refusal. Existing messages were untouched.');
})()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
