import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, House, MagnifyingGlass } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import AppLogo from '../components/AppLogo';
import './NotFound.css';

export default function NotFound() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <Layout>
      <section className="not-found">
        <div className="not-found-card">
          <AppLogo className="not-found-logo" alt="" />
          <p className="not-found-code">404</p>
          <h1>Page not found</h1>
          <p className="not-found-text">
            We couldn&apos;t find <code>{pathname}</code>. The link may be broken, or the page may have been moved or removed.
          </p>
          <div className="not-found-actions">
            <Link to="/" className="not-found-btn not-found-btn--primary">
              <House size={18} weight="fill" /> Go to homepage
            </Link>
            <Link to="/products" className="not-found-btn">
              <MagnifyingGlass size={18} /> Browse products
            </Link>
          </div>
          {window.history.length > 1 && (
            <button type="button" className="not-found-back" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Go back
            </button>
          )}
        </div>
      </section>
    </Layout>
  );
}
