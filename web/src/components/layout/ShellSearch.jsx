import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, CircleNotch, X, Package, Storefront, User, Receipt, ClockCounterClockwise, DotsThreeVertical, PushPin, PushPinSlash } from '@phosphor-icons/react';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import {
  readSearchHistory,
  pushSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
  readPinnedSearches,
  togglePinnedSearch,
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

/**
 * The quick actions for a single result, behind a three-dot button.
 *
 * The list comes from the search source, which is the only place that
 * knows a store has a public storefront and an owner record, or that an
 * order has a buyer to message. Anything without a target was already
 * dropped there, so every entry that reaches here goes somewhere real.
 */
function ResultMenu({ item, onOpen }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The row behind this is itself a button, so every click here has to be
  // stopped from reaching it or opening the menu would also navigate.
  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };

  const actions = item.actions || [];
  if (actions.length === 0) return null;

  return (
    <span className="shell-search-menu" ref={wrapRef}>
      <button
        type="button"
        className="shell-search-menu-btn"
        aria-label={`Actions for ${item.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { swallow(e); setOpen((v) => !v); }}
      >
        <DotsThreeVertical size={18} weight="fill" />
      </button>

      {open && (
        <span className="shell-search-menu-pop" role="menu">
          {actions.map((action) => (action.external ? (
            <a
              key={action.key}
              role="menuitem"
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            >
              {action.label}
            </a>
          ) : (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              onClick={(e) => { swallow(e); setOpen(false); onOpen({ ...item, href: action.href }); }}
            >
              {action.label}
            </button>
          )))}
        </span>
      )}
    </span>
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
  const [pinned, setPinned] = useState(() => readPinnedSearches(scope, userId));
  // Held open for the length of the exit animation. Without this the panel
  // unmounts on the same frame it is asked to close, and there is nothing
  // left on screen to animate.
  const [exiting, setExiting] = useState(false);
  const closeTimer = useRef(null);

  // The list belongs to whoever is signed in, so it is re-read when that
  // changes — switching accounts must not show the previous one's terms.
  // Adjusted during render rather than in an effect: an effect would paint
  // one frame of the old account's searches first.
  const owner = `${scope}:${userId || 'anon'}`;
  const [historyOwner, setHistoryOwner] = useState(owner);
  if (historyOwner !== owner) {
    setHistoryOwner(owner);
    setHistory(readSearchHistory(scope, userId));
    setPinned(readPinnedSearches(scope, userId));
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

  const CLOSE_MS = 150;

  // Set from the handlers that close the panel, never from an effect, so
  // the exit is driven by the interaction that caused it.
  const closePanel = useCallback(() => {
    clearTimeout(closeTimer.current);
    setExiting(true);
    closeTimer.current = setTimeout(() => {
      setExiting(false);
      setIsOpen(false);
    }, CLOSE_MS);
  }, []);

  // Clicking anywhere else closes the panel.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) closePanel();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen, closePanel]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

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

  const togglePin = (term) => {
    setPinned(togglePinnedSearch(scope, userId, term));
    setActive(-1);
  };

  const trimmed = query.trim();
  const showResults = isOpen && trimmed.length >= MIN_CHARS;
  const pinnedSet = new Set(pinned.map((t) => t.toLowerCase()));
  const recentTerms = [...pinned, ...history.filter((t) => !pinnedSet.has(t.toLowerCase()))];
  const showHistory = isOpen && trimmed.length < MIN_CHARS && recentTerms.length > 0;
  const showEmpty = showResults && !isSearching && groups.length === 0;

  // The arrow keys walk whichever list is actually on screen, so recent
  // searches are reachable from the keyboard the same way results are.
  const navigable = showHistory ? recentTerms : flat;

  // Open, the field and the panel are drawn as one card, so the root needs
  // to know: the field loses its bottom curve and the panel picks it up.
  const panelOpen = showResults || showHistory;

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      closePanel();
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
        const term = recentTerms[active >= 0 ? active : 0];
        if (term) runHistoryTerm(term);
        return;
      }
      // Enter with nothing highlighted takes the first result, which is what
      // typing a product name and hitting Enter should obviously do.
      go(flat[active >= 0 ? active : 0]);
    }
  };

  return (
    <div className={`shell-search${panelOpen ? ' is-open' : ''}${exiting ? ' is-closing' : ''} ${className}`.trim()} ref={rootRef}>
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
              {recentTerms.map((term, index) => (
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
                      {pinnedSet.has(term.toLowerCase())
                        ? <PushPin size={15} weight="fill" />
                        : <ClockCounterClockwise size={15} weight="bold" />}
                    </span>
                    <span className="shell-search-result-text">
                      <span className="shell-search-result-title">{term}</span>
                    </span>
                  </button>
                  <span className="shell-search-history-actions">
                    <button
                      type="button"
                      className="shell-search-pin"
                      aria-pressed={pinnedSet.has(term.toLowerCase())}
                      aria-label={pinnedSet.has(term.toLowerCase())
                        ? `Unpin "${term}"`
                        : `Pin "${term}" to the top`}
                      title={pinnedSet.has(term.toLowerCase()) ? 'Unpin' : 'Pin this search'}
                      onClick={() => togglePin(term)}
                    >
                      {pinnedSet.has(term.toLowerCase())
                        ? <PushPinSlash size={13} weight="bold" />
                        : <PushPin size={13} weight="bold" />}
                    </button>
                    <button
                      type="button"
                      className="shell-search-forget"
                      aria-label={`Remove "${term}" from recent searches`}
                      title="Remove"
                      onClick={() => forgetTerm(term)}
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </span>
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
                        <ResultMenu item={item} onOpen={go} />
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
