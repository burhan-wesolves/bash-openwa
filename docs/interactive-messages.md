# Sending business messages

These APIs are available on the **Baileys engine**. whatsapp-web.js returns `501`. They are additions after OpenWA 0.24.0 and require this implementation. Routes use the same OPERATOR role, session/chat restrictions, send pacing, plugin moderation, and optional `Idempotency-Key` header as other send routes.

Use **Message Tester → Business messages** in the dashboard. Select a ready Baileys session, set a phone recipient or group, choose a preset, and edit its JSON. The preview illustrates the content; the result panel reports the API outcome. The editor's session and destination come from the form, so omit `chatId` from its JSON. Example links and PIX keys are placeholders: replace them before sending. No preset triggers a send automatically.

## Buttons, CTA, mixed controls, and PIX

`POST /api/sessions/{sessionId}/messages/send-buttons`

```json
{
  "chatId": "919876543210@c.us",
  "title": "Bill ready for review",
  "description": "Electricity Bill Payment – ₹331.00",
  "footer": "Accept to save, or review first",
  "buttons": [
    { "type": "reply", "displayText": "Accept & Save", "id": "bill_accept_123" },
    { "type": "url", "displayText": "Review bill", "url": "https://example.com/bills/123" },
    { "type": "copy", "displayText": "Copy Link", "copyCode": "https://example.com/bills/123" }
  ]
}
```

| Type    | Required fields                             | Behavior                                                                                   |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `reply` | `displayText`, `id`                         | Sends a response to the business; the incoming event carries `button.id` and `button.text` |
| `url`   | `displayText`, `url`                        | Opens an absolute HTTP(S) URL                                                              |
| `call`  | `displayText`, `phoneNumber`                | Offers a phone call; 5–20 digits with optional leading `+`                                 |
| `copy`  | `displayText`, `copyCode`                   | Copies text locally; does not send a reply                                                 |
| `pix`   | `currency: "BRL"`, `name`, `keyType`, `key` | Offers the Brazilian PIX payment key; does not process or confirm payment                  |

Up to **3 reply + 2 CTA** controls, with a maximum of **5 total**. PIX must be the only button. `keyType` is `phone`, `email`, `cpf`, `cnpj`, or `random`. Payment metadata uses zero amounts for a static key, matching the reference format; this API has no payment-amount or settlement-tracking fields.

PIX uses a payment-only envelope: `title` is retained for outgoing history, while description, footer, and thumbnail are omitted from the WhatsApp payment message. This matches the user's working Evo format.

`thumbnailUrl` optionally adds an image header. Images use OpenWA's existing SSRF-protected, bounded download through the session proxy. Labels are capped at 100 characters, reply IDs at 256, CTA URLs at 2048, copy text at 4096, and PIX name/key at 255.

## Lists

`POST /api/sessions/{sessionId}/messages/send-list`

```json
{
  "chatId": "919876543210@c.us",
  "title": "Choose a service",
  "description": "How can we help?",
  "buttonText": "View options",
  "sections": [
    {
      "title": "Services",
      "rows": [
        { "title": "Billing", "description": "Review a bill", "rowId": "billing" },
        { "title": "Support", "rowId": "support" }
      ]
    }
  ]
}
```

1–10 non-empty sections, **10 rows total**, with unique `rowId`s. Optional `footerText`. Section/row titles and `buttonText` are capped at 100; row descriptions at 1024 and IDs at 256. The list is sent as a native-flow `single_select` menu: `title` and `description` form the message body and `buttonText` opens the menu. Phones dropped the legacy `listMessage` sent from a linked device, while they accept native flow. WhatsApp Web may show the menu with less detail. Selecting a row arrives through the existing incoming `button` event fields, with `button.id` set to the `rowId`.

## Carousel

`POST /api/sessions/{sessionId}/messages/send-carousel`

```json
{
  "chatId": "919876543210@c.us",
  "body": "Our plans",
  "cards": [
    {
      "body": "Basic plan",
      "buttons": [{ "type": "url", "displayText": "View Basic", "url": "https://example.com/basic" }]
    },
    { "body": "Pro plan", "buttons": [{ "type": "reply", "displayText": "Choose Pro", "id": "choose_pro" }] }
  ]
}
```

1–10 cards, each with `body`, optional `footer`/`imageUrl`, and 1–3 reply/CTA buttons (maximum 2 CTA per card). PIX is unavailable in cards. For an illustrated carousel, set `imageUrl` on each card. A single card without an image is sent as a native flow; the introduction and card body are both preserved.

## Shared behavior and limits

Only individual and group destinations are accepted. Title/footer text is capped at 1024, body/description at 4096, image URLs at 4096. Optional text fields must be non-empty when supplied. `quotedMessageId` quotes an earlier message stored in the Baileys engine; unknown quotes fail with `404`. Disappearing-message timers are preserved.

Responses use the usual `MessageResponseDto` (`messageId`, `timestamp`). A successful response confirms handoff to the session; delivery is tracked through the existing message-status events. Validation returns `400`, a disconnected engine `409`, oversized fetched media `413`, unavailable engines `501`, and recipient lookup failures `503`. Authorization and pacing retain their existing `401`/`403`/`429` responses. The Swagger examples are executable request bodies.

Outgoing history stores readable text plus `metadata.businessMessage: { kind, payload }`. This metadata preserves what was sent without offering outgoing controls as inbound buttons to click. Reply IDs should include a project-specific correlation handle such as a bill ID; consuming webhooks and actually saving the bill remain application responsibilities.

CTA + an actual selectable list in one message and WhatsApp Flows are not exposed by this implementation. The bill-review screenshot combines reply + URL + copy controls. Gateway tests validate envelopes and lifecycle behavior; final appearance depends on WhatsApp clients and should be verified using the selected test recipient.

JavaScript, Python, PHP, Java, and Go clients expose `sendButtons`/`sendList`/`sendCarousel` (snake_case in Python, exported Go names). SDK types match the API fields. Existing request and idempotency conventions are preserved.
