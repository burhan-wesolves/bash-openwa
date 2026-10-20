import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  ValidateBy,
} from 'class-validator';
import { IsMediaUrl } from '../../../common/media/media-url';
import { validateButtonsInput, validateListInput, validateCarouselInput } from '../../../engine/interactive-validation';
import type { ButtonsInput, ListInput, CarouselInput } from '../../../engine/interfaces/interactive-message';
import { QUOTED_MESSAGE_ID_DESCRIPTION } from './send-message.dto';

/** Combination validation complements the nested field validators and is reused after plugin rewrites. */
function ValidBusinessPayload(check: (value: never) => void): PropertyDecorator {
  return ValidateBy({
    name: 'validBusinessPayload',
    validator: {
      validate: (_value, args) => {
        try {
          check(args!.object as never);
          return true;
        } catch {
          return false;
        }
      },
      defaultMessage: args => {
        try {
          check(args!.object as never);
          return 'Invalid business message';
        } catch (error) {
          return error instanceof Error ? error.message : 'Invalid business message';
        }
      },
    },
  });
}

class BusinessDestinationDto {
  @ApiProperty({ example: '919876543210@c.us' })
  @IsString()
  @IsNotEmpty()
  chatId!: string;

  @ApiPropertyOptional({ description: QUOTED_MESSAGE_ID_DESCRIPTION })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  quotedMessageId?: string;
}

export class BusinessButtonDto {
  @ApiProperty({ enum: ['reply', 'url', 'call', 'copy', 'pix'] })
  @IsIn(['reply', 'url', 'call', 'copy', 'pix'])
  type!: 'reply' | 'url' | 'call' | 'copy' | 'pix';

  @ApiPropertyOptional({ description: 'Required for reply, URL, call, and copy buttons', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayText?: string;

  @ApiPropertyOptional({ description: 'Required reply callback id', maxLength: 256 })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  id?: string;

  @ApiPropertyOptional({ description: 'Required URL target', example: 'https://example.com/bill', maxLength: 2048 })
  @IsOptional()
  @IsMediaUrl()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ description: 'Required call target, digits with optional leading +', maxLength: 21 })
  @IsOptional()
  @IsString()
  @MaxLength(21)
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Required copy-button text', maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  copyCode?: string;

  @ApiPropertyOptional({ description: 'PIX currency; BRL only', enum: ['BRL'] })
  @IsOptional()
  @IsIn(['BRL'])
  currency?: string;

  @ApiPropertyOptional({ description: 'Required PIX merchant name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Required PIX key type', enum: ['phone', 'email', 'cpf', 'cnpj', 'random'] })
  @IsOptional()
  @IsIn(['phone', 'email', 'cpf', 'cnpj', 'random'])
  keyType?: 'phone' | 'email' | 'cpf' | 'cnpj' | 'random';

  @ApiPropertyOptional({ description: 'Required PIX payment key', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  key?: string;
}

export class SendButtonsDto extends BusinessDestinationDto implements ButtonsInput {
  @ApiProperty({ maxLength: 1024 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  description?: string;

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  footer?: string;

  @ApiPropertyOptional({
    description: 'Image header URL; fetched through the session proxy and media safety checks',
    maxLength: 4096,
  })
  @IsOptional()
  @IsMediaUrl()
  @MaxLength(4096)
  thumbnailUrl?: string;

  @ApiProperty({
    type: [BusinessButtonDto],
    minItems: 1,
    maxItems: 5,
    description: 'Up to 3 reply + 2 CTA buttons. PIX must be the only button.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => BusinessButtonDto)
  @ValidBusinessPayload(validateButtonsInput)
  buttons!: BusinessButtonDto[];
}

export class BusinessListRowDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  description?: string;

  @ApiProperty({ description: 'Unique callback id within this list', maxLength: 256 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  rowId!: string;
}

export class BusinessListSectionDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty({ type: [BusinessListRowDto], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BusinessListRowDto)
  rows!: BusinessListRowDto[];
}

export class SendListDto extends BusinessDestinationDto implements ListInput {
  @ApiProperty({ maxLength: 1024 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  description?: string;

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  footerText?: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  buttonText!: string;

  @ApiProperty({
    type: [BusinessListSectionDto],
    minItems: 1,
    maxItems: 10,
    description: 'Maximum 10 rows across all sections',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BusinessListSectionDto)
  @ValidBusinessPayload(validateListInput)
  sections!: BusinessListSectionDto[];
}

export class BusinessCarouselCardDto {
  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body!: string;

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  footer?: string;

  @ApiPropertyOptional({ maxLength: 4096 })
  @IsOptional()
  @IsMediaUrl()
  @MaxLength(4096)
  imageUrl?: string;

  @ApiProperty({ type: [BusinessButtonDto], minItems: 1, maxItems: 3, description: 'Reply/CTA buttons only; no PIX' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => BusinessButtonDto)
  buttons!: BusinessButtonDto[];
}

export class SendCarouselDto extends BusinessDestinationDto implements CarouselInput {
  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body!: string;

  @ApiProperty({ type: [BusinessCarouselCardDto], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BusinessCarouselCardDto)
  @ValidBusinessPayload(validateCarouselInput)
  cards!: BusinessCarouselCardDto[];
}

export const BUSINESS_MESSAGE_EXAMPLES = {
  buttons: {
    mixed: {
      summary: 'Reply + URL + copy (bill review)',
      value: {
        chatId: '919876543210@c.us',
        title: 'Bill ready for review',
        description: 'Electricity bill: ₹331.00',
        buttons: [
          { type: 'reply', displayText: 'Accept & Save', id: 'bill_accept_123' },
          { type: 'url', displayText: 'Review bill', url: 'https://example.com/bills/123' },
          { type: 'copy', displayText: 'Copy Link', copyCode: 'https://example.com/bills/123' },
        ],
      },
    },
    pix: {
      summary: 'Standalone PIX',
      value: {
        chatId: '5511999999999@c.us',
        title: 'Pay with PIX',
        buttons: [
          { type: 'pix', currency: 'BRL', name: 'Example Store', keyType: 'email', key: 'payments@example.com' },
        ],
      },
    },
  },
  list: {
    menu: {
      summary: 'Selectable menu',
      value: {
        chatId: '919876543210@c.us',
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
  },
  carousel: {
    cards: {
      summary: 'Two cards with CTA buttons',
      value: {
        chatId: '919876543210@c.us',
        body: 'Our plans',
        cards: [
          {
            body: 'Basic plan',
            buttons: [{ type: 'url', displayText: 'View Basic', url: 'https://example.com/basic' }],
          },
          { body: 'Pro plan', buttons: [{ type: 'reply', displayText: 'Choose Pro', id: 'choose_pro' }] },
        ],
      },
    },
  },
} satisfies {
  buttons: Record<string, { summary: string; value: ButtonsInput & { chatId: string } }>;
  list: Record<string, { summary: string; value: ListInput & { chatId: string } }>;
  carousel: Record<string, { summary: string; value: CarouselInput & { chatId: string } }>;
};
