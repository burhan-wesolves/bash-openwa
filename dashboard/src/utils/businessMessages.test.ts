import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessPresets, parseBusinessDraft } from './businessMessages.ts';

test('all business presets parse and keep the destination outside the message payload', () => {
  for (const preset of Object.values(businessPresets)) {
    assert.ok(parseBusinessDraft(preset.kind, JSON.stringify(preset.payload)));
    assert.equal(parseBusinessDraft(preset.kind, JSON.stringify({ ...preset.payload, chatId: 'other@c.us' })), null);
  }
});
test('untrusted JSON cannot inject object-valued text into the preview', () => {
  assert.equal(parseBusinessDraft('buttons', '{"title":{},"buttons":[{}]}'), null);
  assert.equal(parseBusinessDraft('carousel', '{"body":"Plans","cards":[null]}'), null);
});
