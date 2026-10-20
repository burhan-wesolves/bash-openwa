export interface BusinessButton {
  type: 'reply' | 'url' | 'call' | 'copy' | 'pix';
  displayText?: string;
  id?: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
  currency?: string;
  name?: string;
  keyType?: 'phone' | 'email' | 'cpf' | 'cnpj' | 'random';
  key?: string;
}

export interface ButtonsPayload {
  title: string;
  description?: string;
  footer?: string;
  thumbnailUrl?: string;
  buttons: BusinessButton[];
  quotedMessageId?: string;
}
export interface ListPayload {
  title: string;
  description?: string;
  footerText?: string;
  buttonText: string;
  sections: { title: string; rows: { title: string; description?: string; rowId: string }[] }[];
  quotedMessageId?: string;
}
export interface CarouselPayload {
  body: string;
  cards: { body: string; footer?: string; imageUrl?: string; buttons: BusinessButton[] }[];
  quotedMessageId?: string;
}
export type BusinessKind = 'buttons' | 'list' | 'carousel';
export type BusinessDraft =
  | { kind: 'buttons'; payload: ButtonsPayload }
  | { kind: 'list'; payload: ListPayload }
  | { kind: 'carousel'; payload: CarouselPayload };

const billLink = 'https://example.com/bills/123';
const reply: BusinessButton = { type: 'reply', displayText: 'Accept & Save', id: 'bill_accept_123' };
const url: BusinessButton = { type: 'url', displayText: 'Review bill', url: billLink };
const copy: BusinessButton = { type: 'copy', displayText: 'Copy Link', copyCode: billLink };
export const businessPresets = {
  reply: { kind: 'buttons', payload: { title: 'Bill ready for review', buttons: [reply] } },
  cta: { kind: 'buttons', payload: { title: 'Review your bill', buttons: [url, copy] } },
  mixed: {
    kind: 'buttons',
    payload: {
      title: 'Bill ready for review',
      description: 'Electricity Bill Payment – ₹331.00\n\nTap Accept & Save to add it, or review first.',
      footer: 'Accept to save, or review first',
      buttons: [reply, url, copy],
    },
  },
  pix: {
    kind: 'buttons',
    payload: {
      title: 'Pay with PIX',
      buttons: [{ type: 'pix', currency: 'BRL', name: 'Example Store', keyType: 'email', key: 'payments@example.com' }],
    },
  },
  list: {
    kind: 'list',
    payload: {
      title: 'Choose a service',
      buttonText: 'View options',
      sections: [
        {
          title: 'Services',
          rows: [
            { title: 'Billing', rowId: 'billing' },
            { title: 'Support', rowId: 'support' },
          ],
        },
      ],
    },
  },
  carousel: {
    kind: 'carousel',
    payload: {
      body: 'Our plans',
      cards: [
        {
          body: 'Basic plan',
          imageUrl: 'https://placehold.co/800x600/jpg?text=Basic+plan',
          buttons: [{ type: 'url', displayText: 'View Basic', url: 'https://example.com/basic' }],
        },
        {
          body: 'Pro plan',
          imageUrl: 'https://placehold.co/800x600/jpg?text=Pro+plan',
          buttons: [{ type: 'reply', displayText: 'Choose Pro', id: 'choose_pro' }],
        },
      ],
    },
  },
} satisfies Record<string, BusinessDraft>;

export type BusinessPreset = keyof typeof businessPresets;

/** JSON editor only supplies message content; session and destination stay in the existing form. */
export function parseBusinessDraft(kind: BusinessKind, json: string): BusinessDraft | null {
  try {
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || 'chatId' in payload) return null;
    const p = payload as Record<string, unknown>;
    const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
    for (const field of [
      'title',
      'description',
      'body',
      'footer',
      'footerText',
      'buttonText',
      'thumbnailUrl',
      'quotedMessageId',
    ]) {
      if (field in p && typeof p[field] !== 'string') return null;
    }
    if (kind === 'buttons' && (!hasText(p.title) || !Array.isArray(p.buttons) || !p.buttons.length)) return null;
    if (
      kind === 'list' &&
      (!hasText(p.title) || !hasText(p.buttonText) || !Array.isArray(p.sections) || !p.sections.length)
    )
      return null;
    if (kind === 'carousel' && (!hasText(p.body) || !Array.isArray(p.cards) || !p.cards.length)) return null;
    if (
      kind === 'carousel' &&
      (p.cards as unknown[]).some(card => !card || typeof card !== 'object' || !('body' in card) || !hasText(card.body))
    )
      return null;
    return { kind, payload } as BusinessDraft;
  } catch {
    return null;
  }
}
