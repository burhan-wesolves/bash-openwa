/** Engine-neutral business-message inputs; protocol details stay inside the adapters. */
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

export interface ButtonsInput {
  title: string;
  description?: string;
  footer?: string;
  thumbnailUrl?: string;
  buttons: BusinessButton[];
  quotedMessageId?: string;
}

export interface BusinessListSection {
  title: string;
  rows: { title: string; description?: string; rowId: string }[];
}

export interface ListInput {
  title: string;
  description?: string;
  footerText?: string;
  buttonText: string;
  sections: BusinessListSection[];
  quotedMessageId?: string;
}

export interface BusinessCarouselCard {
  body: string;
  footer?: string;
  imageUrl?: string;
  buttons: BusinessButton[];
}

export interface CarouselInput {
  body: string;
  cards: BusinessCarouselCard[];
  quotedMessageId?: string;
}
