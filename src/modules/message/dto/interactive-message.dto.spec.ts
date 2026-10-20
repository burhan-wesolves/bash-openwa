import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BUSINESS_MESSAGE_EXAMPLES, SendButtonsDto, SendListDto, SendCarouselDto } from './interactive-message.dto';

const options = { whitelist: true, forbidNonWhitelisted: true };
describe('business message validation', () => {
  it('accepts the mixed and PIX Swagger examples', async () => {
    for (const example of Object.values(BUSINESS_MESSAGE_EXAMPLES.buttons)) {
      expect(await validate(plainToInstance(SendButtonsDto, example.value), options)).toEqual([]);
    }
    expect(await validate(plainToInstance(SendListDto, BUSINESS_MESSAGE_EXAMPLES.list.menu.value), options)).toEqual(
      [],
    );
    expect(
      await validate(plainToInstance(SendCarouselDto, BUSINESS_MESSAGE_EXAMPLES.carousel.cards.value), options),
    ).toEqual([]);
  });
  it.each(
    [
      [{ type: 'reply', displayText: 'Save' }],
      [{ type: 'url', displayText: 'Open', url: 'javascript:alert(1)' }],
      [{ type: 'pix', name: 'Shop', currency: 'INR', keyType: 'email', key: 'a@example.com' }],
      [...BUSINESS_MESSAGE_EXAMPLES.buttons.pix.value.buttons, { type: 'reply', displayText: 'OK', id: 'ok' }],
      Array.from({ length: 3 }, () => ({ type: 'copy', displayText: 'Copy', copyCode: 'abc' })),
      [{ type: 'reply', displayText: 'OK', id: 'ok', injected: true }],
      [null],
    ].map((buttons): [unknown[]] => [buttons]),
  )('rejects invalid button payloads: %j', async buttons => {
    expect(
      (await validate(plainToInstance(SendButtonsDto, { chatId: '1@c.us', title: 'Test', buttons }), options)).length,
    ).toBeGreaterThan(0);
  });
  it('rejects duplicate list IDs and more than ten total rows', async () => {
    const input = BUSINESS_MESSAGE_EXAMPLES.list.menu.value;
    for (const rows of [
      [
        { title: 'A', rowId: 'same' },
        { title: 'B', rowId: 'same' },
      ],
      Array.from({ length: 11 }, (_, i) => ({ title: `${i}`, rowId: `${i}` })),
    ]) {
      expect(
        (await validate(plainToInstance(SendListDto, { ...input, sections: [{ title: 'Menu', rows }] }), options))
          .length,
      ).toBeGreaterThan(0);
    }
  });
  it('rejects PIX in carousel cards', async () => {
    const dto = plainToInstance(SendCarouselDto, {
      chatId: '1@c.us',
      body: 'Plans',
      cards: [{ body: 'Pay', buttons: BUSINESS_MESSAGE_EXAMPLES.buttons.pix.value.buttons }],
    });
    expect((await validate(dto, options)).length).toBeGreaterThan(0);
  });
});
