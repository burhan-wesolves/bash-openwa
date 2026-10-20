'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessage, validateConfig } = require('./message-config');
const Plugin = require('./index');

test('legacy config still sends the original text and preserves replacement characters', () => {
  assert.deepEqual(buildMessage({ appName: '$& {otp}' }, '123456'), {
    mode: 'text',
    text: '$& {otp} | Your verification code is 123456',
  });
});
test('CTA + Reply composes copy, URL and callback buttons with stable callback IDs', () => {
  const message = buildMessage(
    {
      appName: 'Wesolves',
      messageMode: 'cta_reply',
      ctaButtons: [
        { type: 'copy', displayText: 'Copy code', value: '{otp}' },
        { type: 'url', displayText: 'Open app', value: 'https://example.com/login' },
      ],
      replyButtons: [{ displayText: 'Help with {appName}', id: 'auth_help' }],
    },
    '654321',
  );
  assert.equal(message.input.title, 'Wesolves verification');
  assert.deepEqual(message.input.buttons, [
    { type: 'copy', displayText: 'Copy code', copyCode: '654321' },
    { type: 'url', displayText: 'Open app', url: 'https://example.com/login' },
    { type: 'reply', displayText: 'Help with Wesolves', id: 'auth_help' },
  ]);
});
test('CTA mode excludes stored reply rows; phone call targets are supported', () => {
  const message = buildMessage(
    { messageMode: 'cta', ctaButtons: [{ type: 'call', displayText: 'Support', value: '+919999999999' }] },
    '123456',
  );
  assert.deepEqual(message.input.buttons, [{ type: 'call', displayText: 'Support', phoneNumber: '+919999999999' }]);
});
test('rejects invalid formats, malformed buttons, missing OTP and signing secret used as sender', () => {
  for (const config of [
    { messageMode: 'other' },
    { messageTemplate: 'No code' },
    { fallbackSessionId: 'v1,whsec_secret' },
    { messageMode: 'cta', ctaButtons: [] },
    { messageMode: 'cta', ctaButtons: [{ type: 'url', displayText: 'Open', value: 'javascript:alert(1)' }] },
    { messageMode: 'cta', ctaButtons: [{ type: 'url', displayText: 'Open', value: 'https://user:pass@example.com' }] },
    {
      messageMode: 'cta_reply',
      replyButtons: [
        { displayText: 'Help', id: 'x' },
        { displayText: 'Again', id: 'x' },
      ],
    },
    { messageMode: 'cta_reply', replyButtons: [{ displayText: 'Help', id: '{otp}' }] },
    { messageMode: 'cta', ctaButtons: [{ type: 'call', displayText: 'Call', value: 'not a number' }] },
  ])
    assert.throws(() => validateConfig(config));
  assert.throws(() => buildMessage({}, undefined));
  assert.throws(() => buildMessage({}, 'not-a-code'));
});

async function fixture(config = {}) {
  const sent = [];
  let handle;
  const ctx = {
    config,
    registerWebhook: (_route, handler) => {
      handle = handler;
    },
    messages: {
      sendText: async (...args) => sent.push(['text', ...args]),
      sendButtons: async (...args) => sent.push(['buttons', ...args]),
    },
    logger: { warn: () => {}, info: () => {} },
  };
  await new Plugin().onEnable(ctx);
  const req = {
    verified: true,
    method: 'POST',
    sessionId: 'session-1',
    rawBody: JSON.stringify({ user: { phone: '+919999999999' }, sms: { otp: '123456' } }),
  };
  return { ctx, sent, handle, req };
}
test('signed OTP reaches the button capability using the bound session', async () => {
  const f = await fixture({ messageMode: 'cta_reply' });
  await f.handle(f.req);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][0], 'buttons');
  assert.equal(f.sent[0][1], 'session-1');
  assert.equal(f.sent[0][2], '919999999999@c.us');
  assert.equal(f.sent[0][3].buttons[0].copyCode, '123456');
});
test('reads fresh per-delivery config, including fallback sender', async () => {
  const f = await fixture();
  f.ctx.config = { messageMode: 'cta', fallbackSessionId: 'fallback' };
  await f.handle({ ...f.req, sessionId: undefined });
  assert.equal(f.sent[0][0], 'buttons');
  assert.equal(f.sent[0][1], 'fallback');
});
test('rejects unverified, invalid and unbound requests without sending', async () => {
  const f = await fixture();
  for (const req of [
    { ...f.req, verified: false },
    { ...f.req, method: 'GET' },
    { ...f.req, rawBody: 'oops' },
    { ...f.req, sessionId: undefined },
    { ...f.req, rawBody: '{"user":{"phone":"invalid"}}' },
  ]) {
    await assert.rejects(f.handle(req));
  }
  assert.equal(f.sent.length, 0);
});
test('falls back only for a definite unsupported engine, when enabled', async () => {
  const f = await fixture({ messageMode: 'cta', fallbackToText: true });
  f.ctx.messages.sendButtons = async () => {
    throw new Error('Operation not supported by the active engine: sendButtonsMessage');
  };
  await f.handle(f.req);
  assert.equal(f.sent[0][0], 'text');
});
test('never falls back on timeout or unknown delivery status, and never logs OTP errors', async () => {
  const f = await fixture({ messageMode: 'cta', fallbackToText: true });
  f.ctx.messages.sendButtons = async () => {
    throw new Error('timed out sending OTP 123456');
  };
  await assert.rejects(f.handle(f.req), error => !error.message.includes('123456'));
  assert.equal(f.sent.length, 0);
});
test('does not silently fall back by default', async () => {
  const f = await fixture({ messageMode: 'cta' });
  f.ctx.messages.sendButtons = async () => {
    throw new Error('Operation not supported by the active engine: sendButtonsMessage');
  };
  await assert.rejects(f.handle(f.req));
  assert.equal(f.sent.length, 0);
});
