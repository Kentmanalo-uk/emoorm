import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, CircleNotch, X, Package, Storefront, User, Receipt, ClockCounterClockwise } from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import {
  readSearchHistory,
  pushSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from '../../lib/searchHistory';
import './ShellSearch.css';

/**
 * The search box in the Seller Center and Admin top bars.
 *
 * Each caller supplies its own `sources` — the Seller Center searches its own
 * products and orders, the admin panel searches stores, products and people —
 * so this component owns only the behaviour they share: debouncing, dropping
 * stale responses, keyboard navigation and going where a result points.
 *
 * A source is { key, label, run(query, signal) } and `run` resolves to
 * [{ id, title, subtitle, href, kind, image }], where `kind` picks the
 * placeholder shown for a record that has no picture of its own.
 *
 * `scope` separates the recent-search lists, so the Seller Center and the
 * admin panel do not offer each other's terms.
 */

const MIN_CHARS = 2;
const DEBOUNCE_MS = 280;
const PER_SOURCE = 5;

// What to draw when a record has no picture of its own — most stores and
// people in the directory do not, so this is the common case, not the
// error case, and it should look deliberate.
const FALLBACK_ICON = {
  product: Package,
  store: Storefront,
  person: User,
  order: Receipt,
};

function ResultThumb({ src, kind, alt }) {
  const [failed, setFailed] = useState(false);
  const resolved = src ? resolveImg(src) : null;
  const Icon = FALLBACK_ICON[kind] || Package;

  if (!resolved || failed) {
    return (
      <span className={`shell-search-thumb is-${kind || 'product'} is-empty`} aria-hidden="true">
        <Icon size={15} weight="fill" />
      </span>
    );
  }

  return (
    <img
      className={`shell-search-thumb is-${kind || 'product'}`}
      src={resolved}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function ShellSearch({
  sources,
  placeholder = 'Search',
  ariaLabel = 'Search',
  className = '',
  scope = 'shell',
}) {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  // Every request carries a sequence number; a reply that is not the newest is
  // dropped. Without this, a slow response for "sh" can land after "shirt" and
  // show results for the wrong query.
  const sequenceRef = useRef(0);
  const abortRef = useRef(null);

  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState(() => readSearchHistory(scope, userId));

  // The list belongs to whoever is signed in, so it is re-read when that
  // changes — switching accounts must not show the previous one's terms.
  // Adjusted during render rather than in an effect: an effect would paint
  // one frame of the old account's searches first.
  const owner = `${scope}:${userId || 'anon'}`;
  const [historyOwner, setHistoryOwner] = useState(owner);
  if (historyOwner !== owner) {
    setHistoryOwner(owner);
    setHistory(readSearchHistory(scope, userId));
  }

  // One flat list behind the grouped display, so the arrow keys have something
  // simple to walk.
  const flat = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
    [groups],
  );

  const reset = useCallback(() => {
    setGroups([]);
    setActive(-1);
    setIsSearching(false);
  }, []);

  const remember = useCallback((term) => {
    setHistory(pushSearchHistory(scope, userId, term));
  }, [scope, userId]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_CHARS) {
      abortRef.current?.abort();
      reset();
      return undefined;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++sequenceRef.current;

      setIsSearching(true);
      const settled = await Promise.all(sources.map(async (source) => {
        try {
          const items = await source.run(trimmed, controller.signal);
          return { key: source.key, label: source.label, items: (items || []).slice(0, PER_SOURCE) };
        } catch {
          // One source failing (offline, a 403 on a route this role cannot see)
          // should not blank out the others.
          return { key: source.key, label: source.label, items: [] };
        }
      }));

      if (seq !== sequenceRef.current) return;
      setGroups(settled.filter((group) => group.items.length > 0));
      setActive(-1);
      setIsSearching(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, sources, reset]);

  // Clicking anywhere else closes the panel.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // A term is only worth remembering once it actually took someone
  // somewhere. Recording every keystroke, or every abandoned query, fills
  // the list with half-typed words.
  const go = (item) => {
    if (!item?.href) return;
    remember(query);
    setIsOpen(false);
    setQuery('');
    reset();
    inputRef.current?.blur();
    navigate(item.href);
  };

  const runHistoryTerm = (term) => {
    setQuery(term);
    setActive(-1);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const forgetTerm = (term) => {
    setHistory(removeSearchHistory(scope, userId, term));
    setActive(-1);
  };

  const trimmed = query.trim();
  const showResults = isOpen && trimmed.length >= MIN_CHARS;
  const showHistory = isOpen && trimmed.length < MIN_CHARS && history.length > 0;
  const showEmpty = showResults && !isSearching && groups.length === 0;

  // The arrow keys walk whichever list is actually on screen, so recent
  // searches are reachable from the keyboard the same way results are.
  const navigable = showHistory ? history : flat;

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (navigable.length === 0) return;
      event.preventDefault();
      setIsOpen(true);
      setActive((current) => {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = current + step;
        if (next < 0) return navigable.length - 1;
        if (next >= navigable.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (showHistory) {
        const term = history[active >= 0 ? active : 0];
        if (term) runHistoryTerm(term);
        return;
      }
      // Enter with nothing highlighted takes the first result, which is what
      // typing a product name and hitting Enter should obviously do.
      go(flat[active >= 0 ? active : 0]);
    }
  };

  return (
    <div className={`shell-search ${className}`.trim()} ref={rootRef}>
      <div className="shell-search-field">
        <MagnifyingGlass size={16} className="shell-search-icon" weight="bold" />
        <input
          ref={inputRef}
          type="text"
          className="shell-search-input"
          value={query}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults || showHistory}
          aria-controls="shell-search-results"
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
        />
        {isSearching ? (
          <CircleNotch size={15} className="shell-search-spinner" />
        ) : query ? (
          <button
            type="button"
            className="shell-search-clear"
            aria-label="Clear search"
            onClick={() => { setQuery(''); reset(); inputRef.current?.focus(); }}
          >
            <X size={13} weight="bold" />
          </button>
        ) : null}
      </div>

      {showHistory && (
        <div className="shell-search-panel" id="shell-search-results" role="listbox">
          <div className="shell-search-group">
            <p className="shell-search-group-label">
              Recent searches
              <button
                type="button"
                className="shell-search-clear-all"
                onClick={() => { setHistory(clearSearchHistory(scope, userId)); inputRef.current?.focus(); }}
              >
                Clear
              </button>
            </p>
            <ul>
              {history.map((term, index) => (
                <li key={term}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`shell-search-result is-history${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => runHistoryTerm(term)}
                  >
                    <span className="shell-search-thumb is-history is-empty" aria-hidden="true">
                      <ClockCounterClockwise size={15} weight="bold" />
                    </span>
                    <span className="shell-search-result-text">
                      <span className="shell-search-result-title">{term}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shell-search-forget"
                    aria-label={`Remove "${term}" from recent searches`}
                    title="Remove"
                    onClick={() => forgetTerm(term)}
                  >
                    <X size={11} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showResults && (
        <div className="shell-search-panel" id="shell-search-results" role="listbox">
          {showEmpty ? (
            <p className="shell-search-empty">
              {isSearching ? 'Searching…' : `Nothing found for "${trimmed}"`}
            </p>
          ) : (
            groups.map((group) => (
              <div className="shell-search-group" key={group.key}>
                <p className="shell-search-group-label">{group.label}</p>
                <ul>
                  {group.items.map((item) => {
                    const index = flat.findIndex((f) => f.group === group.label && f.id === item.id);
                    return (
                      <li key={`${group.key}-${item.id}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === active}
                          className={`shell-search-result${index === active ? ' is-active' : ''}`}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(item)}
                        >
                          <ResultThumb src={item.image} kind={item.kind} alt="" />
                          <span className="shell-search-result-text">
                            <span className="shell-search-result-title">{item.title}</span>
                            {item.subtitle && (
                              <span className="shell-search-result-sub">{item.subtitle}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
