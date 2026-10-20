'use strict';

// Shared by the sandboxed plugin and the self-contained dashboard editor.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OtpMessageConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const defaults = {
    appName: 'My app',
    messageMode: 'text',
    messageTemplate: '{appName} | Your verification code is {otp}',
    title: '{appName} verification',
    footer: 'Do not share this code.',
    thumbnailUrl: '',
    fallbackSessionId: '',
    fallbackToText: false,
    debug: false,
    ctaButtons: [{ type: 'copy', displayText: 'Copy code', value: '{otp}' }],
    replyButtons: [{ displayText: "I didn't request this", id: 'otp_not_requested' }],
  };

  function configWithDefaults(config = {}) {
    return { ...JSON.parse(JSON.stringify(defaults)), ...config };
  }
  function requireValue(ok, message) {
    if (!ok) throw new Error(message);
  }
  function text(value, max, label, optional = false) {
    requireValue(
      typeof value === 'string' && (optional || value.trim()) && value.length <= max,
      `${label} must be ${optional ? '' : 'non-empty '}text of at most ${max} characters`,
    );
  }
  function url(value, label) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      /* handled below */
    }
    requireValue(
      parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
      `${label} must be an http(s) URL without credentials`,
    );
  }
  function render(template, otp, appName) {
    return template.replace(/\{otp\}|\{appName\}/g, token => (token === '{otp}' ? otp : appName));
  }
  function validateConfig(config) {
    const c = configWithDefaults(config);
    text(c.appName, 100, 'App name');
    requireValue(['text', 'cta', 'cta_reply'].includes(c.messageMode), 'Choose Text, CTA, or CTA + Reply');
    text(c.messageTemplate, 4096, 'Message body');
    requireValue(c.messageTemplate.includes('{otp}'), 'Message body must include {otp} so the code remains visible');
    text(c.fallbackSessionId, 256, 'Fallback session', true);
    requireValue(
      !c.fallbackSessionId.startsWith('v1,whsec_') && !c.fallbackSessionId.startsWith('whsec_'),
      'Fallback session must be a WhatsApp session ID, not a signing secret',
    );
    requireValue(
      typeof c.fallbackToText === 'boolean' && typeof c.debug === 'boolean',
      'Toggle values must be booleans',
    );
    if (c.messageMode === 'text') return c;
    text(c.title, 1024, 'Title');
    text(c.footer, 1024, 'Footer', true);
    text(c.thumbnailUrl, 4096, 'Header image URL', true);
    if (c.thumbnailUrl) url(c.thumbnailUrl, 'Header image URL');
    requireValue(
      Array.isArray(c.ctaButtons) && c.ctaButtons.length >= 1 && c.ctaButtons.length <= 2,
      'Add one or two CTA buttons',
    );
    for (const b of c.ctaButtons) {
      requireValue(b && ['copy', 'url', 'call'].includes(b.type), 'CTA type must be Copy code, Open URL, or Call');
      text(b.displayText, 100, 'CTA label');
      text(b.value, b.type === 'url' ? 2048 : b.type === 'call' ? 21 : 4096, 'CTA value');
      if (b.type === 'url') url(render(b.value, '123456', c.appName), 'CTA URL');
      if (b.type === 'call') requireValue(/^\+?\d{5,20}$/.test(b.value), 'Call target must contain 5–20 digits');
    }
    if (c.messageMode === 'cta_reply') {
      requireValue(
        Array.isArray(c.replyButtons) && c.replyButtons.length >= 1 && c.replyButtons.length <= 3,
        'Add one to three reply buttons',
      );
      const ids = new Set();
      for (const b of c.replyButtons) {
        requireValue(b && typeof b === 'object', 'Invalid reply button');
        text(b.displayText, 100, 'Reply label');
        text(b.id, 256, 'Reply callback ID');
        requireValue(!ids.has(b.id), 'Reply callback IDs must be unique');
        requireValue(!b.id.includes('{otp}'), 'Keep OTPs out of reply callback IDs');
        ids.add(b.id);
      }
    }
    return c;
  }
  function buildMessage(config, otp) {
    requireValue(typeof otp === 'string' && /^\d{4,10}$/.test(otp), 'Invalid OTP payload');
    const c = validateConfig(config);
    const substitute = value => render(value, otp, c.appName);
    const body = substitute(c.messageTemplate);
    text(body, 4096, 'Rendered message body');
    if (c.messageMode === 'text') return { mode: 'text', text: body };
    const buttons = c.ctaButtons.map(b => {
      const displayText = substitute(b.displayText);
      text(displayText, 100, 'Rendered CTA label');
      const value = substitute(b.value);
      if (b.type === 'copy') {
        text(value, 4096, 'Rendered copy value');
        return { type: 'copy', displayText, copyCode: value };
      }
      if (b.type === 'url') {
        text(value, 2048, 'Rendered CTA URL');
        url(value, 'CTA URL');
        return { type: 'url', displayText, url: value };
      }
      return { type: 'call', displayText, phoneNumber: value };
    });
    if (c.messageMode === 'cta_reply') {
      for (const b of c.replyButtons) {
        const displayText = substitute(b.displayText);
        text(displayText, 100, 'Rendered reply label');
        buttons.push({ type: 'reply', displayText, id: b.id });
      }
    }
    const title = substitute(c.title);
    const footer = substitute(c.footer);
    text(title, 1024, 'Rendered title');
    text(footer, 1024, 'Rendered footer', true);
    return {
      mode: c.messageMode,
      text: body,
      input: {
        title,
        description: body,
        ...(footer ? { footer } : {}),
        ...(c.thumbnailUrl ? { thumbnailUrl: c.thumbnailUrl } : {}),
        buttons,
      },
    };
  }
  return { defaults, configWithDefaults, validateConfig, buildMessage };
});
