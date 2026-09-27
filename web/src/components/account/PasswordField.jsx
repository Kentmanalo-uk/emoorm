import { Eye, EyeSlash as EyeOff } from '@phosphor-icons/react';

/** A password input with a show/hide eye, in the Settings page's style (ps-*). */
export default function PasswordField({ label, value, visible, onToggle, onChange, help }) {
  return (
    <label className="ps-field">
      <span className="ps-label">{label}</span>
      <div className="ps-input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ps-input"
          autoComplete="new-password"
        />
        <button type="button" className="ps-input-eye" onClick={onToggle} tabIndex={-1}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {help && <span className="ps-help">{help}</span>}
    </label>
  );
}
