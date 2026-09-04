import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LLM_PROVIDERS, ROUTES, START_COPY, UI } from '../config';
import type { Provider } from '../types';
import { readSettings, setSession, writeSettings } from '../store/storage';

/** The arcade boot. Full-bleed sky. Provider select, then a free-text
 *  model field with a suggestions datalist, then the key (both hidden
 *  for Rules only), an explainer for Rules only and an always-visible
 *  "What's the difference?" toggle, then the blinking start control. */
export default function StartScreen() {
  const navigate = useNavigate();
  const existing = useMemo(() => readSettings(), []);
  const [provider, setProvider] = useState<Provider>(existing.provider);
  const [model, setModel] = useState<string>(
    existing.model ?? LLM_PROVIDERS[existing.provider].defaultModel ?? '',
  );
  const [apiKey, setApiKey] = useState<string>(existing.apiKey);
  const [showDiff, setShowDiff] = useState(false);

  const cfg = LLM_PROVIDERS[provider];
  const needsKey = provider !== 'none';

  useEffect(() => {
    // On provider change, pre-fill the model field with that provider's
    // default. The user is free to type over it.
    setModel(provider === 'none' ? '' : (LLM_PROVIDERS[provider].defaultModel ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  function start() {
    writeSettings({
      provider,
      model: provider === 'none' ? null : model.trim() || cfg.defaultModel,
      apiKey: needsKey ? apiKey : '',
    });
    setSession(true);
    navigate(ROUTES.HOME);
  }

  const datalistId = 'start-model-suggestions';

  return (
    <div className="start-screen">
      <div
        className="start-panel"
        style={{ ['--blink-period' as string]: `${UI.START_BLINK_PERIOD_MS}ms` }}
      >
        <div className="field">
          <label htmlFor="start-provider">{START_COPY.PROVIDER_LABEL}</label>
          <select
            id="start-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
          >
            {(Object.keys(LLM_PROVIDERS) as Provider[]).map((id) => (
              <option key={id} value={id}>
                {LLM_PROVIDERS[id].label}
              </option>
            ))}
          </select>
          {provider === 'none' && (
            <p className="start-explainer">{START_COPY.RULES_ONLY_EXPLAINER}</p>
          )}
        </div>

        {needsKey && (
          <>
            <div className="field">
              <label htmlFor="start-model">{START_COPY.MODEL_LABEL}</label>
              <input
                id="start-model"
                type="text"
                list={datalistId}
                value={model}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setModel(e.target.value)}
              />
              <datalist id={datalistId}>
                {cfg.modelSuggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <span className="help start-help">{START_COPY.MODEL_HELP}</span>
            </div>
            <div className="field">
              <label htmlFor="start-key">{START_COPY.KEY_LABEL}</label>
              <input
                id="start-key"
                type="password"
                value={apiKey}
                placeholder={cfg.keyPlaceholder}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
          </>
        )}

        <div className="start-diff">
          <button
            type="button"
            className="btn-link"
            aria-expanded={showDiff}
            onClick={() => setShowDiff((v) => !v)}
          >
            {START_COPY.DIFFERENCE_TOGGLE}
          </button>
          {showDiff && (
            <div className="start-diff-body">
              <p>{START_COPY.DIFFERENCE_RULES}</p>
              <p>{START_COPY.DIFFERENCE_MODEL}</p>
            </div>
          )}
        </div>

        <button
          type="button"
          className="start-click blink"
          onClick={start}
          aria-label={START_COPY.CLICK_TO_START}
        >
          {START_COPY.CLICK_TO_START}
        </button>
        <p className="start-hint">{START_COPY.HINT}</p>
      </div>
    </div>
  );
}
