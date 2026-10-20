// Hermetic wire checks using the installed Baileys protobuf, without WhatsApp traffic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';

const require = createRequire(import.meta.url);
const { buttonsContent, listContent, carouselContent } = require('../../dist/engine/adapters/baileys-business-messages.js');
function wire(content) {
  const generated = generateWAMessageFromContent('123456789@s.whatsapp.net', content, {
    userJid: '987654321:1@s.whatsapp.net', messageId: 'wire-test',
  });
  return proto.Message.decode(proto.Message.encode(generated.message).finish());
}

test('PIX serializes as a standalone payment template, with no text/media template fields', () => {
  const message = wire(buttonsContent({
    title: 'For history', description: 'Not part of the payment envelope', footer: 'Not part of the payment envelope',
    buttons: [{ type: 'pix', currency: 'BRL', name: 'Example Store', key: 'payments@example.com', keyType: 'email' }],
  }, { hasMediaAttachment: true, imageMessage: { url: 'https://example.com/unused' } }));
  assert.equal(message.interactiveMessage.body, null);
  assert.equal(message.interactiveMessage.footer, null);
  assert.equal(message.interactiveMessage.header, null);
  const button = message.interactiveMessage.nativeFlowMessage.buttons[0];
  assert.equal(button.name, 'payment_info');
  assert.equal(JSON.parse(button.buttonParamsJson).payment_settings[0].pix_static_code.key_type, 'EMAIL');
});

test('list wire payload is a native-flow single_select menu with row ids', () => {
  const message = wire(listContent({ title: 'Choose', buttonText: 'Menu',
    sections: [{ title: 'Services', rows: [{ title: 'Billing', rowId: 'billing' }] }],
  }));
  assert.equal(message.listMessage ?? undefined, undefined);
  const [button] = message.interactiveMessage.nativeFlowMessage.buttons;
  assert.equal(button.name, 'single_select');
  const row = JSON.parse(button.buttonParamsJson).sections[0].rows[0];
  assert.equal(row.description, '');
  assert.equal(row.id, 'billing');
});

test('real protobuf keeps images, card bodies, and native controls together in a carousel', async () => {
  const cards = ['First', 'Second'].map((body, i) => ({ body, imageUrl: 'https://example.com/image',
    buttons: [{ type: 'reply', displayText: 'Choose', id: `pick-${i}` }],
  }));
  const message = wire(await carouselContent({ body: 'Browse', cards }, async () => ({
    hasMediaAttachment: true, imageMessage: { url: 'https://example.com/uploaded', mimetype: 'image/jpeg' },
  })));
  const carousel = message.interactiveMessage.carouselMessage;
  assert.equal(carousel.messageVersion, 1);
  assert.equal(carousel.cards.length, 2);
  for (let i = 0; i < cards.length; i++) {
    assert.equal(carousel.cards[i].body.text, cards[i].body);
    assert.equal(carousel.cards[i].header.hasMediaAttachment, true);
    assert.equal(carousel.cards[i].header.imageMessage.mimetype, 'image/jpeg');
    assert.equal(carousel.cards[i].nativeFlowMessage.buttons[0].name, 'quick_reply');
    assert.equal(JSON.parse(carousel.cards[i].nativeFlowMessage.buttons[0].buttonParamsJson).id, `pick-${i}`);
  }
});

test('single text card contains native-flow template metadata after protobuf conversion', async () => {
  const message = wire(await carouselContent({ body: 'Browse', cards: [{ body: 'First',
    buttons: [{ type: 'url', displayText: 'Open', url: 'https://example.com' }],
  }] }, async () => { throw new Error('No media expected'); }));
  assert.equal(message.interactiveMessage.carouselMessage, null);
  const metadata = JSON.parse(message.interactiveMessage.nativeFlowMessage.messageParamsJson);
  assert.equal(metadata.from, 'api');
  assert.match(metadata.templateId, /^[0-9a-f-]{36}$/);
});
