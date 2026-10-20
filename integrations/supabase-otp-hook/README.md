# Supabase OTP: Text, CTA, or CTA + Reply

This fork adds a configurable Supabase OTP plugin and connects its `messages.sendButtons`
capability to the host's existing Baileys button sender. Plain text remains the default.

## Build and install

1. Build and redeploy **this bash-openwa host** with your normal Docker deployment. Its build
   packages the matching OTP plugin, and its image includes that package outside the data volume.
   On startup the host installs it or upgrades an older copy **before** scanning plugins.
   No separate ZIP upload or release URL is needed for this fork. An equal or newer installed
   version is kept. Existing settings, enabled/disabled state, session overrides, plugin storage,
   instance records and signing secrets are preserved. Back up the data volume before upgrading.
2. Confirm the startup log contains `Installed bundled Supabase Auth OTP v0.4.0` on the first
   upgraded boot, and the plugin card shows v0.4.0. Refresh the dashboard and reopen Configure.
   If it still shows an older version, check the deployment uses the updated image and look for
   `bundled_otp_install_failed` in the server logs (for example, a read-only plugin volume).
3. Enable the plugin for the sending session if it was disabled. Bind the instance's **Session scope** to a
   real WhatsApp session ID. A hook secret belongs only in the instance's secret field.
4. Open Plugins → Supabase Auth OTP → Configure → Configuration. Choose Plain text, CTA,
   or CTA + Reply. Configure the title, body, footer, optional header image, up to two
   CTA buttons (copy, URL, call), and up to three reply labels/callback IDs. Save.
   The Sessions editor also supports per-session overrides; instance JSON config still
   takes precedence where configured. Clear an obsolete override if it masks the editor.
5. Request one OTP using the existing Supabase script. Inspect the recipient phone and
   OpenWA logs. A successful hook acknowledgment means queued, not delivered or verified.

CTA sends require a **Baileys session**. whatsapp-web.js rejects button sends. This is a
protocol-level experimental feature; a relay acknowledgment does not prove that every
Android, iOS or Web client displays the buttons. The preview is illustrative, not proof
of client rendering. There is no live WhatsApp CTA test in this repository's unit tests.

The Configuration tab and the Sessions tab's selected-session editor both load the same
custom UI. Updating only the host without shipping the plugin previously left the old
plain-text form visible, because that form's schema came from the persistent plugin package.

For development, `npm run start:dev` prepares the bundle before starting Nest's watcher.
`npm run build` also prepares it for `node dist/main`. If you change plugin sources during
a watch session, rerun `npm run package:otp` and restart the host. Bump the plugin version
when changing its code so the startup upgrader recognizes it as newer than the installed copy.
The generated bundle lives in `.bundled-plugins/`; the manual ZIP remains available at
`dist/plugins/supabase-otp-hook-0.4.0.zip` for other compatible hosts.

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
it. The startup installer respects newer installed versions; use a matching plugin release
from this fork when you need its editor rather than replacing it from the upstream catalog.
