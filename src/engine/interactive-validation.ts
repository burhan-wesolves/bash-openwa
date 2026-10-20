import { BadRequestException } from '@nestjs/common';
import type { BusinessButton, ButtonsInput, ListInput, CarouselInput } from './interfaces/interactive-message';
import { isMediaUrl } from '../common/media/media-url';

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BadRequestException(message);
}

function text(value: unknown, max: number, field: string, optional = false): void {
  if (optional && value === undefined) return;
  requireValue(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    `${field} must be non-empty text of at most ${max} characters`,
  );
}

/** Also applied after plugin rewrites and at the engine boundary, where REST DTOs are bypassed. */
export function validateBusinessButtons(buttons: BusinessButton[], carousel = false): void {
  requireValue(
    Array.isArray(buttons) && buttons.length >= 1 && buttons.length <= (carousel ? 3 : 5),
    carousel ? 'Each card requires 1..3 buttons' : 'A message requires 1..5 buttons',
  );
  let replies = 0;
  let ctas = 0;
  for (const button of buttons) {
    requireValue(button && ['reply', 'url', 'call', 'copy', 'pix'].includes(button.type), 'Unknown button type');
    if (button.type !== 'pix') text(button.displayText, 100, 'displayText');
    switch (button.type) {
      case 'reply':
        replies++;
        text(button.id, 256, 'reply id');
        break;
      case 'url':
        ctas++;
        text(button.url, 2048, 'button URL');
        requireValue(isMediaUrl(button.url), 'button URL must be an absolute http(s) URL');
        break;
      case 'call':
        ctas++;
        requireValue(
          typeof button.phoneNumber === 'string' && /^\+?\d{5,20}$/.test(button.phoneNumber),
          'phoneNumber must contain 5..20 digits with an optional leading +',
        );
        break;
      case 'copy':
        ctas++;
        text(button.copyCode, 4096, 'copyCode');
        break;
      case 'pix':
        requireValue(!carousel && buttons.length === 1, 'PIX must be sent alone and cannot appear in a carousel');
        requireValue(button.currency === 'BRL', 'PIX currency must be BRL');
        text(button.name, 255, 'PIX merchant name');
        text(button.key, 255, 'PIX key');
        requireValue(['phone', 'email', 'cpf', 'cnpj', 'random'].includes(button.keyType ?? ''), 'Invalid PIX keyType');
        break;
    }
  }
  requireValue(replies <= 3, 'Maximum of 3 reply buttons');
  requireValue(ctas <= 2, 'Maximum of 2 CTA buttons');
}

function optionalUrl(value: unknown, field: string): void {
  if (value === undefined) return;
  text(value, 4096, field);
  requireValue(isMediaUrl(value), `${field} must be an absolute http(s) URL`);
}

export function validateButtonsInput(input: ButtonsInput): void {
  text(input.title, 1024, 'title');
  text(input.description, 4096, 'description', true);
  text(input.footer, 1024, 'footer', true);
  text(input.quotedMessageId, 256, 'quotedMessageId', true);
  optionalUrl(input.thumbnailUrl, 'thumbnailUrl');
  validateBusinessButtons(input.buttons);
}

export function validateListInput(input: ListInput): void {
  text(input.title, 1024, 'title');
  text(input.description, 4096, 'description', true);
  text(input.footerText, 1024, 'footerText', true);
  text(input.buttonText, 100, 'buttonText');
  text(input.quotedMessageId, 256, 'quotedMessageId', true);
  requireValue(
    Array.isArray(input.sections) && input.sections.length >= 1 && input.sections.length <= 10,
    'A list requires 1..10 sections',
  );
  const ids = new Set<string>();
  for (const section of input.sections) {
    requireValue(section && Array.isArray(section.rows) && section.rows.length >= 1, 'Each section requires rows');
    text(section.title, 100, 'section title');
    for (const row of section.rows) {
      requireValue(row, 'Invalid list row');
      text(row.title, 100, 'row title');
      text(row.description, 1024, 'row description', true);
      text(row.rowId, 256, 'rowId');
      requireValue(!ids.has(row.rowId), 'List rowIds must be unique');
      ids.add(row.rowId);
    }
  }
  requireValue(ids.size <= 10, 'Maximum of 10 list rows across all sections');
}

export function validateCarouselInput(input: CarouselInput): void {
  text(input.body, 4096, 'body');
  text(input.quotedMessageId, 256, 'quotedMessageId', true);
  requireValue(
    Array.isArray(input.cards) && input.cards.length >= 1 && input.cards.length <= 10,
    'A carousel requires 1..10 cards',
  );
  for (const card of input.cards) {
    requireValue(card, 'Invalid carousel card');
    text(card.body, 4096, 'card body');
    text(card.footer, 1024, 'card footer', true);
    optionalUrl(card.imageUrl, 'imageUrl');
    validateBusinessButtons(card.buttons, true);
  }
}
