export interface OtpCtaButton {
  type: 'copy' | 'url' | 'call';
  displayText: string;
  value: string;
}
export interface OtpReplyButton {
  displayText: string;
  id: string;
}
export interface OtpMessageConfig extends Record<string, unknown> {
  appName: string;
  messageMode: 'text' | 'cta' | 'cta_reply';
  messageTemplate: string;
  title: string;
  footer: string;
  thumbnailUrl: string;
  fallbackSessionId: string;
  fallbackToText: boolean;
  debug: boolean;
  ctaButtons: OtpCtaButton[];
  replyButtons: OtpReplyButton[];
}
export interface OtpMessage {
  mode: OtpMessageConfig['messageMode'];
  text: string;
  input?: {
    title: string;
    description: string;
    footer?: string;
    thumbnailUrl?: string;
    buttons: {
      type: string;
      displayText: string;
      copyCode?: string;
      url?: string;
      phoneNumber?: string;
      id?: string;
    }[];
  };
}
export const defaults: OtpMessageConfig;
export function configWithDefaults(config?: Record<string, unknown>): OtpMessageConfig;
export function validateConfig(config: Record<string, unknown>): OtpMessageConfig;
export function buildMessage(config: Record<string, unknown>, otp: string): OtpMessage;
