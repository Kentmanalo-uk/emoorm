import { Component } from 'react';
import { ArrowClockwise, House } from '@phosphor-icons/react';
import { reloadForNewVersion, STALE_CODE } from '../lib/reloadForUpdate';
import '../pages/NotFound.css';

/*
 * The safety net under every page: an error while drawing a page shows this
 * card ("Reload" / "Go to homepage") instead of a white screen.
 *
 * A page whose code could not be fetched (a deploy replaced it while this
 * tab was open, so the old file is gone) is not an error the person can do
 * anything about: the site reloads itself once to get the new version.
 *
 *   <ErrorBoundary resetKey={location.pathname}>…</ErrorBoundary>
 *
 * `resetKey`: moving to another page clears the error, so one broken page
 * does not take the rest of the visit with it.
 */

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // Another page: start clean.
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    if (STALE_CODE.test(String(error?.message || error)) && reloadForNewVersion()) return;
    console.error('[page] crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="not-found" role="alert">
        <div className="not-found-card">
          <img className="not-found-logo" src="/brand-icon.png" alt="" />
          <h1>Something went wrong</h1>
          <p className="not-found-text">
            This page stopped working. Reloading usually fixes it; nothing you saved is lost.
          </p>
          <div className="not-found-actions">
            <button type="button" className="not-found-btn not-found-btn--primary" onClick={() => window.location.reload()}>
              <ArrowClockwise size={18} weight="bold" /> Reload
            </button>
            <a href="/" className="not-found-btn">
              <House size={18} weight="fill" /> Go to homepage
            </a>
          </div>
        </div>
      </section>
    );
  }
}
