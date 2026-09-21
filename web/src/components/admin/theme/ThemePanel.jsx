import { useEffect, useMemo, useState } from 'react';
import {
  Palette, FloppyDisk, ArrowCounterClockwise, ArrowUUpLeft, CircleNotch,
  Check, Warning, Eye, EyeSlash, Sun, Moon, Star, Package, CaretRight,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import EmptyArt from '../../ui/EmptyArt';
import useTheme from '../../../hooks/useTheme';
import { PRESETS, DEFAULT_PRESET_ID, getPreset, presetSwatch } from '../../../lib/themePresets';
import { SEEDS, ROLE_SEEDS, CONTRAST_CHECKS } from '../../../lib/themeTokens';
import { themeTokensFor, applyTheme, normalizeTheme } from '../../../lib/theme';
import { contrastRatio, contrastGrade, formatColor, isColor, toHex } from '../../../lib/color';
import './ThemePanel.css';

const NOTATIONS = [
  { key: 'hex', label: 'HEX' },
  { key: 'rgb', label: 'RGB' },
  { key: 'hsl', label: 'HSL' },
];

const sameTheme = (a, b) => JSON.stringify(normalizeTheme(a)) === JSON.stringify(normalizeTheme(b));

/**
 * One editable colour.
 *
 * The swatch is a native colour input, which gets the platform's own picker —
 * including the eyedropper on desktop — for nothing. The text field beside it
 * takes whatever notation is selected, and is only committed when it parses,
 * so half-typed values do not repaint the page on every keystroke.
 */
function ColorField({ label, help, value, notation, overridden, onChange, onClear }) {
  // Null except while someone is typing. Everything else — picking a
  // preset, switching notation, using the swatch — shows the canonical
  // value, which needs no state to stay in step with.
  const [typed, setTyped] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const text = typed ?? (formatColor(value, notation) || '');

  const commit = (next) => {
    setTyped(next);
    if (!next.trim()) { setInvalid(false); return; }
    if (isColor(next)) {
      setInvalid(false);
      onChange(toHex(next));
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="th-field">
      <label className="th-field-swatch" style={{ background: value }}>
        <input
          type="color"
          value={toHex(value) || '#000000'}
          onChange={(event) => { onChange(event.target.value); setInvalid(false); }}
          aria-label={`${label} colour`}
        />
      </label>
      <div className="th-field-body">
        <strong>
          {label}
          {overridden && <span className="th-field-tag">changed</span>}
        </strong>
        {help && <span>{help}</span>}
        <div className="th-field-input">
          <input
            type="text"
            value={text}
            spellCheck={false}
            className={invalid ? 'is-invalid' : ''}
            onBlur={() => { setTyped(null); setInvalid(false); }}
            onChange={(event) => commit(event.target.value)}
            aria-invalid={invalid || undefined}
          />
          {overridden && (
            <button type="button" className="th-field-clear" onClick={onClear} title={`Reset ${label}`}>
              <ArrowUUpLeft size={13} weight="bold" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The contrast report. Ratios are computed from the resolved tokens, so this
 *  measures what will actually be on screen rather than what was typed in. */
function ContrastReport({ tokens }) {
  const results = CONTRAST_CHECKS.map((check) => {
    const ratio = contrastRatio(tokens[check.fg], tokens[check.bg]);
    return { ...check, ratio, grade: contrastGrade(ratio, check.size) };
  });
  const failures = results.filter((r) => r.grade === 'fail');

  return (
    <div className="th-contrast">
      <div className={`th-contrast-head${failures.length ? ' is-bad' : ''}`}>
        {failures.length ? <Warning size={16} weight="fill" /> : <Check size={16} weight="bold" />}
        <strong>
          {failures.length
            ? `${failures.length} combination${failures.length > 1 ? 's' : ''} below WCAG AA`
            : 'Every checked combination meets WCAG AA'}
        </strong>
        <span>
          {failures.length
            ? 'These can still be saved, but some people will not be able to read them.'
            : 'Body text needs 4.5:1, large text and boundaries 3:1.'}
        </span>
      </div>
      <ul className="th-contrast-list">
        {results.map((result) => (
          <li key={result.label} className={`is-${result.grade}`}>
            <span
              className="th-contrast-chip"
              style={{ background: tokens[result.bg], color: tokens[result.fg] }}
            >
              Aa
            </span>
            <span className="th-contrast-label">{result.label}</span>
            <span className="th-contrast-ratio">{result.ratio.toFixed(2)}:1</span>
            <span className="th-contrast-grade">{result.grade === 'fail' ? 'Fails' : result.grade}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A miniature of the real interface.
 *
 * It is the tokens that do the work here, not a copy of the palette: the
 * preview container carries the candidate token set as custom properties, and
 * the markup inside reads the same var() names the rest of the application
 * does. What it shows is therefore what applying would do, including the
 * illustration, which follows the palette because it is embedded rather than
 * linked.
 */
function Preview({ tokens, mode }) {
  return (
    <div className={`th-preview is-${mode}`} style={tokens} data-theme={mode}>
      <div className="th-preview-shell">
        <aside className="th-preview-rail">
          <span className="th-preview-brand" />
          <span className="th-preview-nav is-active" />
          <span className="th-preview-nav" />
          <span className="th-preview-nav" />
        </aside>
        <div className="th-preview-main">
          <header className="th-preview-head">
            <div>
              <h4>Dashboard</h4>
              <p>Last 30 days · Updated just now</p>
            </div>
            <button type="button" className="th-preview-btn">New product</button>
          </header>

          <div className="th-preview-row">
            <div className="th-preview-card">
              <span className="th-preview-muted">Revenue</span>
              <strong className="th-preview-figure">₱48,210</strong>
              <span className="th-preview-badges">
                <em className="is-success">Paid</em>
                <em className="is-warning">Pending</em>
                <em className="is-danger">Cancelled</em>
                <em className="is-info">New</em>
              </span>
            </div>
            <div className="th-preview-card">
              <span className="th-preview-muted">Search</span>
              <span className="th-preview-input">Find an order…</span>
              <span className="th-preview-link">
                View all
                {' '}
                <CaretRight size={10} weight="bold" />
              </span>
            </div>
          </div>

          <div className="th-preview-card th-preview-list">
            <span className="th-preview-item">
              <Package size={14} weight="fill" />
              Calamansi, 1 kg
              <b>₱120</b>
            </span>
            <span className="th-preview-item">
              <Star size={14} weight="fill" />
              Dried mangoes
              <b>₱240</b>
            </span>
          </div>

          <div className="th-preview-card th-preview-empty">
            <EmptyArt name="products" size={64} />
            <strong>No products yet</strong>
            <span className="th-preview-muted">Illustrations follow the palette too.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThemePanel() {
  const { theme: saved, saving, save } = useTheme();
  const [draft, setDraft] = useState(saved);
  const [notation, setNotation] = useState('hex');
  const [previewMode, setPreviewMode] = useState('light');
  const [liveAcrossApp, setLiveAcrossApp] = useState(false);

  // When the saved theme changes — this tab after a save, or a fetch that
  // brought back something different — the draft follows it. Adjusting state
  // during render rather than in an effect means no extra pass and no frame
  // showing the previous palette.
  const [savedSnapshot, setSavedSnapshot] = useState(saved);
  if (!sameTheme(savedSnapshot, saved)) {
    setSavedSnapshot(saved);
    setDraft(saved);
  }

  const preset = getPreset(draft.presetId) || getPreset(DEFAULT_PRESET_ID);
  const tokens = useMemo(() => themeTokensFor(draft, previewMode), [draft, previewMode]);
  const dirty = !sameTheme(draft, saved);
  const customised = Boolean(draft.seeds || draft.roles || draft.ramps);

  /* The whole-application preview. Painting the draft onto the document is
     the honest way to see a palette — a swatch grid never shows you the one
     screen where the contrast falls apart. It is reverted on the way out,
     including if this tab is closed mid-preview. */
  useEffect(() => {
    if (!liveAcrossApp) return undefined;
    applyTheme({ ...draft, mode: previewMode, allowDarkMode: previewMode === 'dark' });
    return () => applyTheme(saved);
  }, [liveAcrossApp, draft, previewMode, saved]);

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const pickPreset = (id) => {
    // Choosing a preset starts clean: the point of picking one is to get its
    // palette, not the previous one's edits layered over it.
    setDraft((current) => ({
      ...current,
      presetId: id,
      seeds: null,
      roles: null,
      ramps: null,
      extended: null,
    }));
  };

  const setSeed = (key, value) => setDraft((current) => ({
    ...current,
    seeds: { ...(current.seeds || {}), [key]: value },
  }));

  const clearSeed = (key) => setDraft((current) => {
    const next = { ...(current.seeds || {}) };
    delete next[key];
    return { ...current, seeds: Object.keys(next).length ? next : null };
  });

  const setRole = (key, value) => setDraft((current) => ({
    ...current,
    roles: { ...(current.roles || {}), [key]: value },
  }));

  const clearRole = (key) => setDraft((current) => {
    const next = { ...(current.roles || {}) };
    delete next[key];
    return { ...current, roles: Object.keys(next).length ? next : null };
  });

  const onSave = async () => {
    try {
      await save(draft);
      setLiveAcrossApp(false);
      toast.success('Theme applied across the app');
    } catch (err) {
      toast.error(err?.message || 'Failed to save the theme');
    }
  };

  const onRestoreDefault = async () => {
    try {
      await save(null);
      setDraft(normalizeTheme(null));
      setLiveAcrossApp(false);
      toast.success('Restored the default palette');
    } catch (err) {
      toast.error(err?.message || 'Failed to restore the default');
    }
  };

  const seedGroups = SEEDS.reduce((groups, seed) => {
    (groups[seed.group] = groups[seed.group] || []).push(seed);
    return groups;
  }, {});

  const roleGroups = ROLE_SEEDS.reduce((groups, role) => {
    (groups[role.group] = groups[role.group] || []).push(role);
    return groups;
  }, {});

  return (
    <section className="st-panel th-panel">
      <header className="st-panel-head">
        <div>
          <h2>Theme &amp; colours</h2>
          <p>
            One palette for every screen — buyers, sellers, municipal admins and here.
            Nothing else changes: layout, spacing and type stay as they are.
          </p>
        </div>
        <div className="th-mode-switch" role="group" aria-label="Preview mode">
          <button
            type="button"
            className={previewMode === 'light' ? 'is-active' : ''}
            onClick={() => setPreviewMode('light')}
          >
            <Sun size={14} weight="fill" /> Light
          </button>
          <button
            type="button"
            className={previewMode === 'dark' ? 'is-active' : ''}
            onClick={() => setPreviewMode('dark')}
          >
            <Moon size={14} weight="fill" /> Dark
          </button>
        </div>
      </header>

      <div className="th-layout">
        <div className="th-editor">
          {/* ── Presets ────────────────────────────────────────────── */}
          <div className="th-block">
            <div className="th-block-head">
              <strong>Presets</strong>
              <span>Start from one of these, then change what you like.</span>
            </div>
            <div className="th-presets">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`th-preset${draft.presetId === item.id ? ' is-active' : ''}`}
                  onClick={() => pickPreset(item.id)}
                  aria-pressed={draft.presetId === item.id}
                >
                  <span className="th-preset-swatch">
                    {presetSwatch(item).map((color, index) => (
                      <i key={`${item.id}-${index}`} style={{ background: color }} />
                    ))}
                  </span>
                  <span className="th-preset-body">
                    <strong>
                      {item.name}
                      {item.id === DEFAULT_PRESET_ID && <em>default</em>}
                    </strong>
                    <span>{item.description}</span>
                  </span>
                  {draft.presetId === item.id && (
                    <Check size={14} weight="bold" className="th-preset-tick" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Custom palette ─────────────────────────────────────── */}
          <div className="th-block">
            <div className="th-block-head">
              <strong>Custom palette</strong>
              <span>
                Each colour builds a full range of tints and shades, so changing
                one here reaches every badge, border and hover state that uses it.
              </span>
              <div className="th-notation" role="group" aria-label="Colour notation">
                {NOTATIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={notation === item.key ? 'is-active' : ''}
                    onClick={() => setNotation(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {Object.entries(seedGroups).map(([group, seeds]) => (
              <div key={group} className="th-group">
                <h5>{group}</h5>
                <div className="th-fields">
                  {seeds.map((seed) => (
                    <ColorField
                      key={seed.key}
                      label={seed.label}
                      help={seed.help}
                      notation={notation}
                      value={draft.seeds?.[seed.key] || preset.seeds[seed.key]}
                      overridden={Boolean(draft.seeds?.[seed.key])}
                      onChange={(value) => setSeed(seed.key, value)}
                      onClear={() => clearSeed(seed.key)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {Object.entries(roleGroups).map(([group, roles]) => (
              <div key={group} className="th-group">
                <h5>{group}</h5>
                <div className="th-fields">
                  {roles.map((role) => (
                    <ColorField
                      key={role.key}
                      label={role.label}
                      help={draft.roles?.[role.key] ? undefined : 'Follows the neutral colour.'}
                      notation={notation}
                      value={draft.roles?.[role.key] || tokens[role.token]}
                      overridden={Boolean(draft.roles?.[role.key])}
                      onChange={(value) => setRole(role.key, value)}
                      onClear={() => clearRole(role.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Dark mode ──────────────────────────────────────────── */}
          <div className="th-block">
            <div className="th-block-head">
              <strong>Dark mode</strong>
              <span>
                Built from the same palette by mirroring each colour range, so it
                needs no second set of choices. Still new — worth walking through
                the main screens before turning it on for everyone.
              </span>
            </div>
            <label className="th-toggle">
              <input
                type="checkbox"
                checked={draft.allowDarkMode}
                onChange={(event) => patch({
                  allowDarkMode: event.target.checked,
                  mode: event.target.checked ? draft.mode : 'light',
                })}
              />
              <span>Allow dark mode</span>
            </label>
            {draft.allowDarkMode && (
              <div className="th-radios" role="radiogroup" aria-label="Default appearance">
                {[
                  { key: 'light', label: 'Light', help: 'Everyone gets the light palette.' },
                  { key: 'system', label: 'Follow the device', help: 'Whatever the browser asks for.' },
                  { key: 'dark', label: 'Dark', help: 'Everyone gets the dark palette.' },
                ].map((option) => (
                  <label key={option.key} className={draft.mode === option.key ? 'is-active' : ''}>
                    <input
                      type="radio"
                      name="theme-mode"
                      checked={draft.mode === option.key}
                      onChange={() => patch({ mode: option.key })}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.help}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Preview and contrast ─────────────────────────────────── */}
        <aside className="th-side">
          <div className="th-block th-block-sticky">
            <div className="th-block-head">
              <strong>Live preview</strong>
              <span>
                {customised ? 'Custom palette' : preset.name}
                {' · '}
                {previewMode === 'dark' ? 'Dark' : 'Light'}
              </span>
            </div>
            <Preview tokens={tokens} mode={previewMode} />
            <button
              type="button"
              className={`th-live${liveAcrossApp ? ' is-on' : ''}`}
              onClick={() => setLiveAcrossApp((on) => !on)}
            >
              {liveAcrossApp ? <EyeSlash size={15} weight="fill" /> : <Eye size={15} weight="fill" />}
              {liveAcrossApp ? 'Stop previewing on this page' : 'Preview on this page'}
            </button>
            {liveAcrossApp && (
              <p className="th-live-note">
                Only you see this, and only until you leave. Save to apply it for everyone.
              </p>
            )}
            <ContrastReport tokens={tokens} />
          </div>
        </aside>
      </div>

      <footer className="st-panel-foot th-foot">
        {dirty && <span className="st-dirty">Unsaved changes</span>}
        <button
          type="button"
          className="st-btn st-btn-text"
          onClick={onRestoreDefault}
          disabled={saving}
        >
          <Palette size={15} weight="fill" /> Restore default
        </button>
        <button
          type="button"
          className="st-btn st-btn-soft"
          onClick={() => { setDraft(saved); setLiveAcrossApp(false); }}
          disabled={saving || !dirty}
        >
          <ArrowCounterClockwise size={15} weight="bold" /> Reset
        </button>
        <button
          type="button"
          className="st-btn st-btn-primary"
          onClick={onSave}
          disabled={saving || !dirty}
        >
          {saving ? <CircleNotch size={15} className="spin" /> : <FloppyDisk size={15} weight="fill" />}
          {saving ? 'Applying…' : 'Apply and save'}
        </button>
      </footer>
    </section>
  );
}
