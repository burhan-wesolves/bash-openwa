import { randomUUID } from 'node:crypto';
import type { BinaryNode, proto } from '@whiskeysockets/baileys';
import type { BusinessButton, ButtonsInput, ListInput, CarouselInput } from '../interfaces/interactive-message';

type NativeButton = { name: string; buttonParamsJson: string };
type ImageHeader = proto.Message.InteractiveMessage.IHeader;

/** WhatsApp business stanza metadata accompanies the protobuf body in the relay. */
export function businessNodes(): BinaryNode[] {
  const child: BinaryNode = {
    tag: 'interactive',
    attrs: { type: 'native_flow', v: '1' },
    content: [{ tag: 'native_flow', attrs: { name: 'mixed', v: '9' } }],
  };
  return [{ tag: 'biz', attrs: {}, content: [child] }];
}

export function nativeButton(button: BusinessButton): NativeButton {
  const label = { display_text: button.displayText };
  let name: string;
  let params: object;
  switch (button.type) {
    case 'reply':
      name = 'quick_reply';
      params = { ...label, id: button.id };
      break;
    case 'url':
      name = 'cta_url';
      params = { ...label, url: button.url, merchant_url: button.url };
      break;
    case 'call':
      name = 'cta_call';
      params = { ...label, phone_number: button.phoneNumber };
      break;
    case 'copy':
      name = 'cta_copy';
      params = { ...label, copy_code: button.copyCode };
      break;
    case 'pix': {
      name = 'payment_info';
      const amount = { value: 0, offset: 100 };
      const keyTypes = { phone: 'PHONE', email: 'EMAIL', cpf: 'CPF', cnpj: 'CNPJ', random: 'EVP' };
      params = {
        currency: 'BRL',
        total_amount: amount,
        reference_id: randomUUID(),
        type: 'physical-goods',
        order: {
          status: 'pending',
          subtotal: amount,
          order_type: 'ORDER',
          items: [{ name: '', amount, quantity: 0, sale_amount: amount }],
        },
        payment_settings: [
          {
            type: 'pix_static_code',
            pix_static_code: {
              merchant_name: button.name,
              key: button.key,
              key_type: keyTypes[button.keyType!],
            },
          },
        ],
        share_payment_status: false,
      };
      break;
    }
  }
  return { name, buttonParamsJson: JSON.stringify(params) };
}

export function buttonsContent(input: ButtonsInput, header?: ImageHeader): proto.IMessage {
  // payment_info uses its own template, without text or media decoration.
  const payment = input.buttons[0]?.type === 'pix';
  return {
    interactiveMessage: {
      ...(!payment ? { body: { text: `*${input.title}*${input.description ? `\n\n${input.description}` : ''}` } } : {}),
      ...(!payment && input.footer ? { footer: { text: input.footer } } : {}),
      ...(!payment && header ? { header } : {}),
      nativeFlowMessage: {
        buttons: input.buttons.map(nativeButton),
        messageParamsJson: JSON.stringify({ from: 'api', templateId: randomUUID() }),
      },
    },
  };
}

/**
 * Lists travel as a native-flow single_select menu. Phones drop the legacy listMessage from linked
 * devices while accepting native flow; WhatsApp Web may render this menu with less detail.
 */
export function listContent(input: ListInput): proto.IMessage {
  const params = {
    title: input.buttonText,
    sections: input.sections.map(section => ({
      title: section.title,
      highlight_label: '',
      rows: section.rows.map(row => ({
        header: row.title,
        title: row.title,
        description: row.description ?? '',
        id: row.rowId,
      })),
    })),
  };
  return {
    interactiveMessage: {
      body: {
        text: `*${input.title}*${
          input.description
            ? `

${input.description}`
            : ''
        }`,
      },
      ...(input.footerText ? { footer: { text: input.footerText } } : {}),
      nativeFlowMessage: {
        buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify(params) }],
        messageParamsJson: JSON.stringify({ from: 'api', templateId: randomUUID() }),
      },
    },
  };
}

export async function carouselContent(
  input: CarouselInput,
  imageHeader: (url: string) => Promise<ImageHeader>,
): Promise<proto.IMessage> {
  // Prepare sequentially: ten media downloads/encodes must not multiply the per-send memory cap.
  const cards: proto.Message.IInteractiveMessage[] = [];
  for (const card of input.cards) {
    cards.push({
      body: { text: card.body },
      ...(card.footer ? { footer: { text: card.footer } } : {}),
      ...(card.imageUrl ? { header: await imageHeader(card.imageUrl) } : {}),
      nativeFlowMessage: { buttons: card.buttons.map(nativeButton) },
    });
  }
  // A one-card text-only message is rendered as a native flow on iOS.
  if (cards.length === 1 && !input.cards[0].imageUrl) {
    return {
      interactiveMessage: {
        ...cards[0],
        body: { text: `${input.body}\n\n${input.cards[0].body}` },
        nativeFlowMessage: {
          ...cards[0].nativeFlowMessage,
          messageParamsJson: JSON.stringify({ from: 'api', templateId: randomUUID() }),
        },
      },
    };
  }
  return { interactiveMessage: { body: { text: input.body }, carouselMessage: { cards, messageVersion: 1 } } };
}
