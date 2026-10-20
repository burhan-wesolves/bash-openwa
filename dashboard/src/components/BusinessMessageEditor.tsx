import { useTranslation } from 'react-i18next';
import { businessPresets, type BusinessPreset, type BusinessDraft } from '../utils/businessMessages';
import './BusinessMessageEditor.css';

interface Props {
  preset: BusinessPreset;
  json: string;
  draft: BusinessDraft | null;
  engineReady: boolean;
  onPreset: (preset: BusinessPreset) => void;
  onJson: (json: string) => void;
}

export function BusinessMessageEditor({ preset, json, draft, engineReady, onPreset, onJson }: Props) {
  const { t } = useTranslation();
  // Preview is illustrative, never a WhatsApp delivery claim or a clickable business action.
  const p = draft?.payload;
  const labels =
    draft?.kind === 'buttons' && Array.isArray(draft.payload.buttons)
      ? draft.payload.buttons.flatMap(button =>
          button && typeof button === 'object'
            ? [String(button.displayText ?? (button.type === 'pix' ? 'PIX' : button.type))]
            : [],
        )
      : [];
  return (
    <div className="business-editor">
      <div
        className="toggle-group toggle-group-wrap business-presets"
        role="group"
        aria-label={t('messageTester.business.presets')}
      >
        {(Object.keys(businessPresets) as BusinessPreset[]).map(key => (
          <button
            key={key}
            type="button"
            className={key === preset ? 'active' : ''}
            aria-pressed={key === preset}
            onClick={() => onPreset(key)}
          >
            {t(`messageTester.business.${key}`)}
          </button>
        ))}
      </div>
      <p className={engineReady ? 'hint' : 'hint error'} role="status">
        {t('messageTester.business.baileysOnly')}
      </p>
      <p className="hint">{t(`messageTester.business.${businessPresets[preset].kind}Hint`)}</p>
      <div className="form-group">
        <label htmlFor="business-json">{t('messageTester.business.payload')}</label>
        <textarea
          id="business-json"
          className="business-json"
          rows={16}
          spellCheck={false}
          value={json}
          onChange={event => onJson(event.target.value)}
          aria-invalid={!draft}
          aria-describedby="business-json-help"
        />
        <span id="business-json-help" className={draft ? 'hint' : 'hint error'} role="status">
          {t(draft ? 'messageTester.business.editHint' : 'messageTester.business.invalid')}
        </span>
      </div>
      <div className="business-preview" aria-label={t('messageTester.business.preview')}>
        <span className="hint">{t('messageTester.business.preview')}</span>
        {p && (
          <>
            {'title' in p && <strong>{p.title}</strong>}
            {'description' in p && <p>{p.description}</p>}
            {'body' in p && <p>{p.body}</p>}
            {'footer' in p && <small>{p.footer}</small>}
            {labels.map((label, index) => (
              <div className="business-preview-button" key={index}>
                {label}
              </div>
            ))}
            {draft?.kind === 'list' && <div className="business-preview-button">{draft.payload.buttonText}</div>}
            {draft?.kind === 'carousel' && (
              <div className="business-preview-cards">
                {draft.payload.cards.map((card, index) => (
                  <div className="business-preview-card" key={index}>
                    <span>{card && typeof card.body === 'string' ? card.body : '…'}</span>
                    {Array.isArray(card?.buttons) &&
                      card.buttons.map((button, i) => (
                        <div className="business-preview-button" key={i}>
                          {typeof button?.displayText === 'string' ? button.displayText : '…'}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
