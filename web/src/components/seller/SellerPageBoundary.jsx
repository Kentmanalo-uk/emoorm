import { Component } from 'react';
import { Link } from 'react-router-dom';
import { ArrowClockwise, House } from '@phosphor-icons/react';
import { reloadForNewVersion, STALE_CODE } from '../../lib/reloadForUpdate';
import '../../pages/NotFound.css';

/*
 * The safety net under each Seller Center page. The site-wide one
 * (components/ErrorBoundary) sits above the whole shell, so a page that broke
 * took the sidebar and the tab bar with it and its "Go to homepage" left the
 * Seller Center. This one sits inside the shell: the navigation stays, and
 * the way out is the Seller Center home.
 *
 *   <SellerPageBoundary resetKey={location.pathname}><Outlet /></SellerPageBoundary>
 *
 * `resetKey`: another page starts clean.
 */
export default class SellerPageBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    // A page whose code is gone after a deploy: get the new version once.
    if (STALE_CODE.test(String(error?.message || error)) && reloadForNewVersion()) return;
    console.error('[seller page] crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="not-found sc-page-error" role="alert">
        <div className="not-found-card">
          <img className="not-found-logo" src="/brand-icon.png" alt="" />
          <h1>This page stopped working</h1>
          <p className="not-found-text">
            Reloading usually fixes it; nothing you saved is lost. The rest of the Seller Center still works.
          </p>
          <div className="not-found-actions">
            <button type="button" className="not-found-btn not-found-btn--primary" onClick={() => window.location.reload()}>
              <ArrowClockwise size={18} weight="bold" /> Reload
            </button>
            <Link to="/seller" className="not-found-btn">
              <House size={18} weight="fill" /> Seller Center home
            </Link>
          </div>
        </div>
      </section>
    );
  }
}
