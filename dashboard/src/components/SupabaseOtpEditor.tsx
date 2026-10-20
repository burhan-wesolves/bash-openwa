import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Phone, Plus, Trash2 } from 'lucide-react';
import {
  buildMessage,
  configWithDefaults,
  type OtpCtaButton,
  type OtpMessageConfig,
} from '../../../shared/supabase-otp-message.mjs';
import { pluginsApi, type Plugin } from '../services/api';
import { sparseSessionOverride } from '../utils/pluginConfigRules';
import { queryKeys } from '../hooks/queries';
import './SupabaseOtpEditor.css';

/** First-party settings use React state and the dashboard API, never a plugin iframe. */
export function SupabaseOtpEditor({ plugin, sessionId }: { plugin: Plugin; sessionId?: string }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [config, setConfig] = useState(() =>
    configWithDefaults({
      ...plugin.config,
      ...(sessionId ? plugin.sessionConfig?.[sessionId] : {}),
    }),
  );
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [status, setStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const interactive = config.messageMode !== 'text';
  let preview: ReturnType<typeof buildMessage> | undefined;
  let validation = '';
  try {
    preview = buildMessage(config, '123456');
  } catch (error) {
    validation = error instanceof Error ? error.message : 'Invalid configuration';
  }
  const change = <K extends keyof OtpMessageConfig>(key: K, value: OtpMessageConfig[K]) => {
    setConfig(current => ({ ...current, [key]: value }));
    setStatus('');
    setSaveError('');
  };
  const changeCta = (index: number, patch: Partial<OtpCtaButton>) => {
    change(
      'ctaButtons',
      config.ctaButtons.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const save = async (clear = false) => {
    if (busy.current) return;
    if (!clear && validation) {
      setSaveError(validation);
      return;
    }
    busy.current = true;
    setSaving(true);
    setSaveError('');
    setStatus('');
    try {
      const result = sessionId
        ? await pluginsApi.updateSessionConfig(plugin.id, sessionId, clear ? {} : sparseSessionOverride(config, plugin))
        : await pluginsApi.updateConfig(plugin.id, config);
      if (!result.success) throw new Error(result.message || 'Could not save configuration');
      if (clear) setConfig(configWithDefaults(plugin.config));
      void queryClient.invalidateQueries({ queryKey: queryKeys.plugins });
      setStatus(
        clear
          ? 'Session overrides cleared. Global settings apply.'
          : 'Configuration saved. Changes apply to the next OTP.',
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save configuration');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="otp-editor">
      <div className="otp-editor-heading">
        <h3>Authentication message</h3>
        <p>Configure how the verification code appears in WhatsApp.</p>
      </div>
      <div className="otp-editor-layout">
        <form
          className="config-form otp-editor-form"
          onSubmit={event => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={saving} className="otp-editor-fields">
            <section className="otp-settings-section" aria-label="Message settings">
              <h4>Message</h4>
              <label htmlFor={`${id}-app`}>App name</label>
              <input
                id={`${id}-app`}
                required
                maxLength={100}
                value={config.appName}
                onChange={event => change('appName', event.target.value)}
              />
              <label htmlFor={`${id}-mode`}>Message format</label>
              <select
                id={`${id}-mode`}
                value={config.messageMode}
                onChange={event => change('messageMode', event.target.value as OtpMessageConfig['messageMode'])}
              >
                <option value="text">Plain text</option>
                <option value="cta">CTA</option>
                <option value="cta_reply">CTA + Reply</option>
              </select>
              <label htmlFor={`${id}-body`}>Message body</label>
              <textarea
                id={`${id}-body`}
                required
                maxLength={4096}
                value={config.messageTemplate}
                onChange={event => change('messageTemplate', event.target.value)}
              />
              <small>
                Use {'{otp}'} for the code and {'{appName}'} for your app name. Keep the code in the body.
              </small>
              {interactive && (
                <>
                  <label htmlFor={`${id}-title`}>Title</label>
                  <input
                    id={`${id}-title`}
                    required
                    maxLength={1024}
                    value={config.title}
                    onChange={event => change('title', event.target.value)}
                  />
                  <label htmlFor={`${id}-footer`}>Footer</label>
                  <input
                    id={`${id}-footer`}
                    maxLength={1024}
                    value={config.footer}
                    onChange={event => change('footer', event.target.value)}
                  />
                  <label htmlFor={`${id}-image`}>Header image URL (optional)</label>
                  <input
                    id={`${id}-image`}
                    type="url"
                    maxLength={4096}
                    value={config.thumbnailUrl}
                    onChange={event => change('thumbnailUrl', event.target.value)}
                  />
                </>
              )}
            </section>
            {interactive && (
              <section className="otp-settings-section" aria-label="CTA buttons">
                <h4>CTA buttons</h4>
                <p>Choose up to two actions.</p>
                {config.ctaButtons.map((button, index) => (
                  <div className="otp-button-row" key={index}>
                    <div className="otp-row-header">
                      <strong>CTA {index + 1}</strong>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Remove CTA ${index + 1}`}
                        onClick={() =>
                          change(
                            'ctaButtons',
                            config.ctaButtons.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <label htmlFor={`${id}-cta-${index}-type`}>Action {index + 1}</label>
                    <select
                      id={`${id}-cta-${index}-type`}
                      value={button.type}
                      onChange={event => changeCta(index, { type: event.target.value as OtpCtaButton['type'] })}
                    >
                      <option value="copy">Copy code / text</option>
                      <option value="url">Open URL</option>
                      <option value="call">Call</option>
                    </select>
                    <label htmlFor={`${id}-cta-${index}-label`}>CTA {index + 1} label</label>
                    <input
                      id={`${id}-cta-${index}-label`}
                      required
                      maxLength={100}
                      value={button.displayText}
                      onChange={event => changeCta(index, { displayText: event.target.value })}
                    />
                    <label htmlFor={`${id}-cta-${index}-value`}>
                      {button.type === 'copy'
                        ? 'Text to copy'
                        : button.type === 'url'
                          ? 'Destination URL'
                          : 'Phone number'}{' '}
                      {index + 1}
                    </label>
                    <input
                      id={`${id}-cta-${index}-value`}
                      required
                      type={button.type === 'url' ? 'url' : 'text'}
                      maxLength={button.type === 'url' ? 2048 : button.type === 'call' ? 21 : 4096}
                      value={button.value}
                      onChange={event => changeCta(index, { value: event.target.value })}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={config.ctaButtons.length >= 2}
                  onClick={() =>
                    change('ctaButtons', [
                      ...config.ctaButtons,
                      { type: 'url', displayText: 'Open app', value: 'https://example.com' },
                    ])
                  }
                >
                  <Plus size={15} /> Add CTA
                </button>
              </section>
            )}
            {config.messageMode === 'cta_reply' && (
              <section className="otp-settings-section" aria-label="Reply buttons">
                <h4>Reply buttons</h4>
                <p>
                  Replies send callback IDs to your incoming-message webhook. They do not verify an OTP or sign a user
                  in.
                </p>
                {config.replyButtons.map((button, index) => (
                  <div className="otp-button-row" key={index}>
                    <div className="otp-row-header">
                      <strong>Reply {index + 1}</strong>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Remove reply ${index + 1}`}
                        onClick={() =>
                          change(
                            'replyButtons',
                            config.replyButtons.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <label htmlFor={`${id}-reply-${index}-label`}>Reply {index + 1} label</label>
                    <input
                      id={`${id}-reply-${index}-label`}
                      required
                      maxLength={100}
                      value={button.displayText}
                      onChange={event =>
                        change(
                          'replyButtons',
                          config.replyButtons.map((row, i) =>
                            i === index ? { ...row, displayText: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <label htmlFor={`${id}-reply-${index}-id`}>Reply {index + 1} callback ID</label>
                    <input
                      id={`${id}-reply-${index}-id`}
                      required
                      maxLength={256}
                      value={button.id}
                      onChange={event =>
                        change(
                          'replyButtons',
                          config.replyButtons.map((row, i) => (i === index ? { ...row, id: event.target.value } : row)),
                        )
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={config.replyButtons.length >= 3}
                  onClick={() =>
                    change('replyButtons', [
                      ...config.replyButtons,
                      { displayText: 'Contact support', id: `otp_support_${Date.now()}` },
                    ])
                  }
                >
                  <Plus size={15} /> Add reply
                </button>
              </section>
            )}
            <section className="otp-settings-section" aria-label="Delivery settings">
              <h4>Delivery</h4>
              <p>CTA messages require a Baileys session. Choose the sender under Instances → Edit → Session scope.</p>
              <label htmlFor={`${id}-sender`}>Fallback WhatsApp session ID (optional)</label>
              <input
                id={`${id}-sender`}
                maxLength={256}
                value={config.fallbackSessionId}
                placeholder="Session ID, never the hook secret"
                onChange={event => change('fallbackSessionId', event.target.value)}
              />
              <label className="otp-checkbox">
                <input
                  type="checkbox"
                  checked={config.fallbackToText}
                  onChange={event => change('fallbackToText', event.target.checked)}
                />
                Use plain text when the engine explicitly reports that buttons are unsupported.
              </label>
              <label className="otp-checkbox">
                <input
                  type="checkbox"
                  checked={config.debug}
                  onChange={event => change('debug', event.target.checked)}
                />
                Log delivery diagnostics without the OTP.
              </label>
            </section>
          </fieldset>
          {validation && (
            <p className="otp-editor-error" role="alert">
              {validation}
            </p>
          )}
          {saveError && (
            <p className="otp-editor-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="otp-editor-actions">
            {sessionId && (
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => void save(true)}>
                Use global settings
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={saving || !!validation}>
              {saving ? 'Saving…' : 'Save configuration'}
            </button>
          </div>
          <p role="status" aria-live="polite" className="otp-editor-status">
            {status}
          </p>
        </form>
        <aside className="otp-preview" aria-label="Message preview">
          <h4>Message preview</h4>
          <div className="otp-preview-bubble">
            {preview?.input?.thumbnailUrl && <div className="otp-preview-image">Header image configured</div>}
            {preview?.input && <strong>{preview.input.title}</strong>}
            <div className="otp-preview-body">
              {preview?.text || 'Complete your message settings to see the preview.'}
            </div>
            {preview?.input?.footer && <small>{preview.input.footer}</small>}
            {preview?.input?.buttons.map((button, index) => (
              <div className="otp-preview-button" key={index}>
                {button.type === 'copy' ? (
                  <Copy size={14} />
                ) : button.type === 'url' ? (
                  <ExternalLink size={14} />
                ) : button.type === 'call' ? (
                  <Phone size={14} />
                ) : null}
                <span>{button.displayText}</span>
                <small>{button.copyCode || button.url || button.phoneNumber || `Reply: ${button.id}`}</small>
              </div>
            ))}
          </div>
          <p>Example code: 123456. This preview sends no message. Button rendering can vary across WhatsApp clients.</p>
        </aside>
      </div>
    </div>
  );
}
