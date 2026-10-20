# Supabase OTP: Text, CTA, or CTA + Reply

This fork adds a configurable Supabase OTP plugin and connects its `messages.sendButtons`
capability to the host's existing Baileys button sender. Plain text remains the default.

## Build and install

1. Build and deploy **this bash-openwa host**, including the dashboard, with your normal Docker
   deployment. Older upstream hosts do not expose the button capability to plugins.
2. Run `npm run package:otp`. The installable archive is
   `dist/plugins/supabase-otp-hook-0.4.0.zip`.
3. For a **new** installation, upload the archive through Plugins → Install plugin → Upload.
   For an **existing** installation, that upload route refuses duplicate IDs. Publish the
   archive as a release asset on your fork, calculate its SHA-256, and use the admin-only
   `POST /api/plugins/supabase-otp-hook/update` endpoint with JSON
   `{"url":"https://your-release-asset-url.zip#sha256=YOUR_64_CHARACTER_DIGEST"}`.
   This existing staged-update API preserves plugin configuration, activation and enabled
   state and rolls back a failed update. Back up your OpenWA data first. Keep the existing
   instance, signing secret and ingress URL. Do not uninstall/recreate the plugin.
4. Enable the plugin for the sending session. Bind the instance's **Session scope** to a
   real WhatsApp session ID. A hook secret belongs only in the instance's secret field.
5. Open Plugins → Supabase Auth OTP → Configure → Configuration. Choose Plain text, CTA,
   or CTA + Reply. Configure the title, body, footer, optional header image, up to two
   CTA buttons (copy, URL, call), and up to three reply labels/callback IDs. Save.
   The Sessions editor also supports per-session overrides; instance JSON config still
   takes precedence where configured. Clear an obsolete override if it masks the editor.
6. Request one OTP using the existing Supabase script. Inspect the recipient phone and
   OpenWA logs. A successful hook acknowledgment means queued, not delivered or verified.

CTA sends require a **Baileys session**. whatsapp-web.js rejects button sends. This is a
protocol-level experimental feature; a relay acknowledgment does not prove that every
Android, iOS or Web client displays the buttons. The preview is illustrative, not proof
of client rendering. There is no live WhatsApp CTA test in this repository's unit tests.

## Configuration

- `messageMode`: `text` (default), `cta`, `cta_reply`.
- `messageTemplate`, `title`, `footer`, CTA labels/values, and reply labels support
  `{appName}` and `{otp}`. Keep `{otp}` in the body so a user can enter it manually.
- `ctaButtons`: rows `{ type: 'copy' | 'url' | 'call', displayText, value }`.
  A copy button with `value: '{otp}'` copies the Supabase-generated code.
- `replyButtons`: rows `{ displayText, id }`. IDs must be unique, stable, and contain no OTP.
  These appear on incoming-message webhook events through the host's existing reply mapping.
  A reply **does not** call Supabase verification, confirm a user, or revoke a session.
  Handle actions such as `otp_not_requested` in your own backend.
- `fallbackToText`: default `false`. Only a definite unsupported-engine error falls back
  to text. A timeout/transport error must not cause a second OTP message.
- `fallbackSessionId`: sender used only when the instance is not bound to a session.
- `debug`: delivery metadata only; the plugin does not log OTPs, raw payloads, or full recipients.

Signature verification, replay protection, session scope, send permission, moderation,
pacing, message persistence and ingress deduplication still run in the host. The hook
uses the same verified Standard Webhooks payload and same Supabase-generated OTP.
It acknowledges with HTTP 200 after durable acceptance; the worker handles delivery.

To preview without sending, open `dist/plugins/supabase-otp-preview.html` after packaging.
The standalone editor shows defaults; saving requires the authenticated dashboard.

## Checks

```sh
npm run test:otp
npm test -- --runInBand src/core/plugins/plugin-capability.spec.ts src/core/plugins/sandbox/capability-router.spec.ts src/core/plugins/sandbox/worker-capability.spec.ts
npm run build
npm run package:otp
```

On PowerShell, calculate the release digest with:

```powershell
Get-FileHash .\dist\plugins\supabase-otp-hook-0.4.0.zip -Algorithm SHA256
```

The plugin source is maintained in this repository. An upstream catalog update can replace
it, so package future changes from this source rather than overwriting it from the catalog.
