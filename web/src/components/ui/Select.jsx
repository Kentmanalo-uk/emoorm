import {
  Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from '@phosphor-icons/react';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import './Select.css';

/**
 * E-MOORM's own dropdown, used in place of the browser's <select>.
 *
 * A drop-in: it takes <option> children and the same props (value, onChange,
 * disabled, name, id, className, aria-*), and onChange receives an
 * event-like object, so `onChange={(e) => setX(e.target.value)}` works
 * unchanged. The trigger keeps the caller's className, so a field keeps its
 * size and place; it also carries "ui-select", which the stylesheets treat
 * like a select.
 *
 * On computers the options open in a menu under the field (above it when
 * there is no room below). On phones they open in a bottom sheet with large
 * rows. Keyboard: Enter, Space or the arrow keys open it; arrows, Home, End
 * and typing a letter move; Enter picks; Escape or Tab closes.
 */

const optionsFrom = (children) => {
  const list = [];
  const walk = (nodes) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === 'option') {
        const { value, children: label, disabled, hidden } = child.props;
        const text = Children.toArray(label).join('');
        list.push({
          value: value === undefined ? text : String(value),
          label: text,
          disabled: Boolean(disabled),
          hidden: Boolean(hidden),
        });
      } else if (child.props?.children) {
        walk(child.props.children);
      }
    });
  };
  walk(children);
  return list;
};

const MENU_GAP = 6;
const MENU_MAX = 320;

export default function Select({
  value,
  defaultValue,
  onChange,
  children,
  className = '',
  disabled = false,
  name,
  id,
  title,
  style,
  required,
  placeholder,
  onBlur,
  ...rest
}) {
  const isPhone = usePhoneLayout();
  const options = useMemo(() => optionsFrom(children), [children]);
  const [inner, setInner] = useState(defaultValue !== undefined ? String(defaultValue) : options[0]?.value ?? '');
  const current = value !== undefined && value !== null ? String(value) : inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const { mounted: sheetMounted, closing: sheetClosing } = useSheetPresence(open && isPhone);

  const choosable = useCallback((i) => i >= 0 && i < options.length && !options[i].disabled && !options[i].hidden, [options]);
  const step = useCallback((from, dir) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (choosable(i)) return i;
    return from;
  }, [options.length, choosable]);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - MENU_GAP - 8;
    const above = r.top - MENU_GAP - 8;
    const up = below < Math.min(MENU_MAX, options.length * 40 + 12) && above > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)),
      width: r.width,
      top: up ? undefined : r.bottom + MENU_GAP,
      bottom: up ? window.innerHeight - r.top + MENU_GAP : undefined,
      maxHeight: Math.max(160, Math.min(MENU_MAX, up ? above : below)),
    });
  }, [options.length]);

  const show = () => {
    if (disabled) return;
    const at = options.findIndex((o) => o.value === current);
    setActive(choosable(at) ? at : step(-1, 1));
    if (!isPhone) place();
    setOpen(true);
  };
  const hide = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  const pick = (i) => {
    if (!choosable(i)) return;
    const next = options[i].value;
    hide();
    if (next === current) return;
    if (value === undefined) setInner(next);
    if (onChange) {
      const target = { value: next, name, id };
      onChange({ target, currentTarget: target, type: 'change', preventDefault() {}, stopPropagation() {} });
    }
  };

  // Desktop: follow the field while the page scrolls or resizes; close on a
  // click elsewhere.
  useEffect(() => {
    if (!open || isPhone) return undefined;
    const onScroll = (e) => { if (!list.current?.contains(e.target)) place(); };
    const onDown = (e) => {
      if (!trigger.current?.contains(e.target) && !list.current?.contains(e.target)) hide(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, isPhone, place, hide]);

  // Keep the active option in view.
  useLayoutEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, sheetMounted]);

  const onKeyDown = (e) => {
    if (disabled) return;
    const key = e.key;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (key === 'Escape') { e.preventDefault(); hide(); return; }
    if (key === 'Tab') { hide(false); return; }
    if (key === 'ArrowDown') { e.preventDefault(); setActive((a) => step(a, 1)); return; }
    if (key === 'ArrowUp') { e.preventDefault(); setActive((a) => step(a, -1)); return; }
    if (key === 'Home') { e.preventDefault(); setActive(step(-1, 1)); return; }
    if (key === 'End') { e.preventDefault(); setActive(step(options.length, -1)); return; }
    if (key === 'Enter' || key === ' ') { e.preventDefault(); pick(active); return; }
    if (key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + key.toLowerCase(), at: now };
      const hit = options.findIndex((o, i) => choosable(i) && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  const label = rest['aria-label'] || title || placeholder || '';
  const optionRows = options.map((o, i) => (o.hidden ? null : (
    <li
      key={`${o.value}-${i}`}
      id={`${listId}-${i}`}
      data-index={i}
      role="option"
      aria-selected={o.value === current}
      aria-disabled={o.disabled || undefined}
      className={`ui-select-option${o.value === current ? ' is-selected' : ''}${i === active ? ' is-active' : ''}${o.disabled ? ' is-disabled' : ''}`}
      onMouseEnter={() => choosable(i) && setActive(i)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(i)}
    >
      <span className="ui-select-option-label">{o.label}</span>
      {o.value === current && <Check size={16} weight="bold" className="ui-select-check" aria-hidden="true" />}
    </li>
  )));

  const listbox = (extra = '') => (
    <ul
      ref={list}
      id={listId}
      role="listbox"
      aria-label={label || undefined}
      tabIndex={-1}
      className={`ui-select-list${extra}`}
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
    >
      {optionRows}
    </ul>
  );

  return (
    <>
      <button
        {...rest}
        ref={trigger}
        type="button"
        id={id}
        title={title}
        style={style}
        disabled={disabled}
        className={`ui-select${className ? ` ${className}` : ''}${open ? ' is-open' : ''}${selected && selected.value !== '' ? '' : ' is-placeholder'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        <span className="ui-select-value">{selected ? selected.label : (placeholder || '')}</span>
        <CaretDown size={14} weight="bold" className="ui-select-caret" aria-hidden="true" />
      </button>
      {name && <input type="hidden" name={name} value={current} />}

      {open && !isPhone && pos && createPortal(
        <div
          className="ui-select-menu"
          style={{
            left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxHeight,
          }}
        >
          {listbox()}
        </div>,
        document.body,
      )}

      {sheetMounted && isPhone && createPortal(
        <div
          className={`ui-select-sheet-backdrop ui-sheet-backdrop${sheetClosing ? ' is-closing' : ''}`}
          onClick={() => hide()}
          role="presentation"
        >
          <div
            className="ui-select-sheet ui-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-label={label || 'Choose an option'}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <span className="ui-select-sheet-grip" aria-hidden="true" />
            {label && <p className="ui-select-sheet-title">{label}</p>}
            {listbox(' is-sheet')}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
