# Interactive business messages

## Outcome

Allow an operator to send and test CTA, reply, mixed reply + CTA, PIX, list, and carousel messages using OpenWA's Baileys engine. The reference is the user's working custom Evolution API at `F:\Third Party Repo\bash_evo_api`. Implement the protocol independently in OpenWA's existing architecture; do not copy Evolution application code or change that repository.

## Scope and acceptance criteria

- [x] `POST /api/sessions/:sessionId/messages/send-buttons` accepts reply/url/call/copy buttons, including the screenshot's reply + URL + copy combination; PIX must be alone.
- [x] `POST .../send-list` sends a legacy SINGLE_SELECT menu; `POST .../send-carousel` sends up to ten cards with optional image headers and reply/CTA buttons.
- [x] Every route requires OPERATOR, session/chat authorization, idempotency, send pacing, and the plugin sending gate. Persist pending, sent, and failed states through the existing send service.
- [x] Validate nested inputs and protocol limits before network traffic, including inputs rewritten by plugins. Use the existing proxy-aware, SSRF-protected media loader for images.
- [x] Honor quotes, recipient resolution, disappearing-message timers, sent-message storage, own-send deduplication, and outbound events.
- [x] whatsapp-web.js returns HTTP 501; the dashboard explains availability and prevents sending through that engine.
- [x] Message Tester offers Reply, CTA, Mixed, PIX, List, and Carousel presets, an editable JSON payload, destination/session selection, preview, and the existing result panel.
- [x] Swagger exposes usable examples, payload schemas, and error responses. Document endpoints and limits, and update the engine capability matrix.
- [x] Focused tests cover validation, raw relay envelopes/business nodes, safety checks, persistence/failure hooks, authorization/idempotency metadata, and UI/API wiring. Backend and dashboard build successfully.

CTA + an actual list in one message and WhatsApp Flows are excluded: the reference does not expose the former and Flows were not requested. The screenshot is mixed reply + CTA.

## Implementation steps

1. Define engine-neutral input types and DTOs with nested validation and explicit combination limits: reply <=3, CTA <=2, total <=5; PIX alone; list <=10 rows across <=10 sections; carousel 1..10 cards, 1..3 buttons per card, no PIX.
2. Add thin adapter methods. Build protobuf interactive/list/carousel content in a dedicated Baileys module and relay through the existing messaging delegate, preserving the send lifecycle and error semantics. Keep remote-image fetches bounded and behind the session proxy.
3. Add controller routes and service facade methods; reuse MessageSendService's moderation, persistence, and failure/success handling. Store the interactive payload for history without treating outgoing buttons as received choices to click.
4. Extend the existing Message Tester with a business-message editor and presets. Reuse ready-session selection, role restrictions, recipient resolution, sequential group sends, and response presentation. Add typed API methods.
5. Update API/capability documentation and generated OpenAPI. Run focused tests, build/type/lint checks, and inspect the UI where environment access permits.

## Validation boundaries

Automated checks verify payloads and gateway integration. Real recipient rendering and button callbacks must be confirmed against Android, iOS, and Web using a connected Baileys session; no WhatsApp messages are sent without an explicitly selected test recipient. The user reports these formats work in their Evo installation.

Flowboard tools are unavailable in this session. This local plan records the work until it can be synced to the team's board; no project association or remote tracking keys have been invented.

## Mobile compatibility follow-up — 2026-10-13

The user reports PIX/list missing on a different recipient's mobile app and carousel displaying only an image, while Evo works. Compared the local Evo builders, raw relay, socket configuration, and installed Baileys sources. Evo uses Baileys rc.9; OpenWA uses rc14. No downgrade is made.

- [x] Match the standalone PIX native-flow envelope: omit text, footer, and media; do not fetch an unused thumbnail.
- [x] Supply list row descriptions explicitly, including empty descriptions, matching Evo's legacy SINGLE_SELECT payload.
- [x] Include template metadata in the single text-card native-flow fallback.
- [x] Generate sender-aware message IDs before own-send registration, matching the ID-generation input used by Evo's relay.
- [x] Add targeted relay tests and real protobuf round-trip tests that verify carousel card text, images, and controls survive serialization.
- [ ] Confirm rendering on the user's recipient mobile after rebuilding. These code differences are corrected; automated tests cannot establish the complete cause of client-specific rendering failures.

Validation: 134 focused gateway tests and four real-protobuf tests passed; backend build and changed-file ESLint passed. Existing delivery/read records indicate that some tests reached a recipient client, but do not identify which client rendered them. No new live WhatsApp messages were sent by the agent.

## Relay investigation after unsuccessful mobile retest

The user confirms the same issue across two sessions and three recipients, with the same numbers working through Evo. The payload-only changes did not resolve it.

Compared both installed protobuf encoders: representative list, PIX, and image-carousel bodies encode identically in rc14 and rc.9. An offline harness exercised the real messages-send implementation from each package with network and encryption boundaries stubbed. With successful encryption, both produced the same list bytes for the recipient's primary and linked devices, the same device-sent wrapper for the sender's devices, and the same participants/tctoken/biz stanza structure.

Injecting a primary-recipient encryption failure produced different behavior: rc14 logged an error, omitted that device, sent to remaining devices, and resolved successfully; rc.9 threw and did not send a stanza. This reproduces a possible source of false success, but is not yet proof of the live failure's cause. No dependency downgrade or speculative transport patch has been applied.

Temporary Docker diagnostic override: `tmp/mobile-diagnostics.compose.yml` sets `BAILEYS_LOG_LEVEL=debug`. The current container was recreated with the existing data and session mounts. A fresh ordinary Text and List send to the same recipient is requested to correlate primary-device enumeration/encryption with mobile visibility. Resume ordinary configuration after the investigation with `docker compose -p openwa -f docker-compose.dev.yml up -d --no-build --force-recreate --no-deps openwa`. Flowboard tools remain unavailable.

The user instead tested Text and PIX: only Text appeared on mobile, while both appeared on Web. Both sends enumerated the recipient's primary device and linked device, and the logs contain no encryption failure. The live trace therefore does not support the partial-encryption hypothesis. Both destinations were LIDs.

Evo retains the verified phone-number JID for phone-number inputs. OpenWA converted those inputs to LIDs before relaying. Business sends now preserve the verified phone-number route; explicit LIDs resolve to a phone-number JID when the mapping is available. Ordinary sends retain their existing routing. This is a focused compatibility experiment, with mobile rendering still pending confirmation.

Validation of this routing change: 125 focused tests and 31 real-library inbound/outbound/wire checks passed; backend build and changed-file ESLint passed. Docker image `fbde3ecf4dc1` was built and deployed with diagnostics; readiness and container health passed. A fresh PIX, followed by List and Carousel, was requested from the user. No live test messages were sent by the agent.

## Completed validation

- Backend: 11 focused suites, 313 tests passed; production build, TypeScript, and ESLint passed.
- Dashboard: 37 tester/preset tests passed; production build, changed-file ESLint, and translation key parity passed.
- SDKs: JavaScript 139 tests and TypeScript passed; Go suite passed; all five SDKs pass route/documentation coverage checks. Python syntax compilation passed; PHP runtime and full Java Maven checks unavailable in this environment.
- Generated OpenAPI includes all three endpoints. Whitespace checks passed.
- In-app browser unavailable, so UI verification uses rendered component tests. No live WhatsApp delivery was attempted.
- A broader backend run encountered existing Windows failures in shell/process and path assumptions; focused feature checks passed.

## Phone receipt trace and device-identity experiment — 2026-10-13

The user reports PIX, list, and carousel still reach WhatsApp Web but not the recipient's phone, across multiple sessions and recipients, while Evo delivers to both.

- Stored OpenWA payloads for the latest PIX (`3EB04EF15E035767435460`) and list (`3EB0AE6A717E1891E4C389`) match Evo's builders field for field; both were relayed with the same `biz` nodes.
- The rc.9 and rc14 relay paths differ only in tctoken gating, reporting tokens (not triggered: no `messageSecret`), and encryption-failure handling; none is specific to business messages.
- Debug trace: both sends were encrypted to five devices, including the recipient's primary device (`917574940196:0`). Delivery and read receipts arrived only from linked device `:90`. The primary device sent no delivery receipt and no retry receipt. Text sends reach the phone. The phone therefore discards business stanzas from this companion rather than failing to decrypt them.
- Remaining configuration difference: Evo omits `browser` (commented "use native Multi-Device, not WebClient"), so it pairs with Baileys' default `['Mac OS', 'Chrome', …]`. OpenWA pairs as `['OpenWA', 'Chrome', '120.0.0']`. Registration `DeviceProps` differ only in `os`; it applies at pairing, so a re-pair is required.

Experiment: `tmp/mobile-diagnostics.compose.yml` now also sets `BAILEYS_BROWSER_NAME=Mac OS`. The container was rebuilt with it. The user must log out and re-pair one session, then send PIX, list, and carousel to a previously failing recipient. If the phone renders them, make the macOS identity the default; otherwise test Baileys rc.9 on a branch. Carousel "image only" could not be inspected: no carousel is stored since the last restart.

Result: re-paired as `Mac OS` — no change; the phone still sent no receipt. Device identity is ruled out.

### Wire trace (BAILEYS_LOG_LEVEL=trace), same session and recipient

- Text `3EB0C2CDADD7E148A77E7A` (reached phone): `to='187045892886756@lid'`, all participants LID; `participants`, `device-identity`, `tctoken`.
- PIX `3EB0BCF7D7670DCBE1FD3C` (Web only): `to='917574940196@s.whatsapp.net'`, all participants PN; the same nodes plus `biz/interactive native_flow mixed v=9`.
- Neither carried a `reporting` node. Normal rc14 sends get `messageContextInfo.messageSecret` from `generateWAMessageContent`; the raw business relay did not.

Change: business sends now use the ordinary send routing (LID when known) instead of the PN experiment, and carry a random 32-byte `messageSecret`, so the PIX/list stanza differs from the working text only by content and `biz`. Container rebuilt; retest pending.

### Retest after routing + messageSecret change

Phone receipts (delivery and read from `187045892886756@lid`) arrived for Reply, CTA, and CTA+Reply; those now render on mobile. PIX and the legacy list still drew receipts only from the Web device. The list stanza (`type='media'`, `enc mediatype='list'`, `biz/list product_list v=2`) matches the Evo shape; the cause of the phone drop is unidentified.

PIX is out of scope for now: payment_info is Brazil-only and the user's Evo does not show it on this Indian recipient's phone either.

Change: lists are sent as a native-flow `single_select` interactive message with the `native_flow mixed` business node, the format the phone accepts. Row selections arrive as `interactiveResponseMessage` with `id = rowId`, which the existing reply mapper already parses. WhatsApp Web may show this menu with less detail than the legacy list. Container rebuilt; mobile retest pending.
