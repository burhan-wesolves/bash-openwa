'use strict';

const { validateConfig, buildMessage } = require('./message-config');

class SupabaseOtpHook {
  async onEnable(ctx) {
    validateConfig(ctx.config);
    ctx.registerWebhook('send-sms', async req => {
      if (!req.verified) throw new Error('A verified Supabase signature is required');
      if (req.method !== 'POST') throw new Error('Supabase OTP hook requires POST');
      let payload;
      try {
        payload = JSON.parse(req.rawBody);
      } catch {
        throw new Error('Invalid OTP JSON payload');
      }
      const phone = payload?.user?.phone;
      if (typeof phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
        throw new Error('Invalid OTP recipient');
      }
      const config = validateConfig(ctx.config);
      const sessionId = req.sessionId || config.fallbackSessionId;
      if (!sessionId || /^(v1,)?whsec_/.test(sessionId)) throw new Error('Bind a WhatsApp session to this instance');
      const chatId = `${phone.replace(/^\+/, '')}@c.us`;
      const message = buildMessage(config, payload?.sms?.otp);
      if (message.mode === 'text') {
        await ctx.messages.sendText(sessionId, chatId, message.text);
      } else {
        if (typeof ctx.messages.sendButtons !== 'function') {
          throw new Error('Install the bash-openwa host build with messages.sendButtons support');
        }
        try {
          await ctx.messages.sendButtons(sessionId, chatId, message.input);
        } catch (error) {
          // Only a definite, pre-delivery unsupported-operation error may fall back. A timeout or
          // transport failure may have delivered the message already; do not send a duplicate.
          const unsupported =
            error instanceof Error &&
            error.message.includes('Operation not supported by the active engine: sendButtonsMessage');
          if (!config.fallbackToText || !unsupported)
            throw new Error('OTP button delivery failed; check the session engine and host logs');
          ctx.logger.warn('OTP buttons unsupported; using configured text fallback');
          await ctx.messages.sendText(sessionId, chatId, message.text);
        }
      }
      if (config.debug) ctx.logger.info('OTP send accepted by engine', { mode: message.mode, sessionId });
      return { status: 200, body: '{}' };
    });
  }

  async onConfigChange(_ctx, config) {
    validateConfig(config);
  }
  async healthCheck() {
    return { healthy: true };
  }
}

module.exports = SupabaseOtpHook;
