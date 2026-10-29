import { Link } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';
import EmptyArt from '../ui/EmptyArt';
import './AdminFormPage.css';

/*
 * A create or edit form on a page of its own (/admin/banners/new,
 * /admin/banners/<id>/edit …) instead of a panel opened above the list:
 * back to the list, the title, the form, and beside it on a computer what
 * helps fill it in (a preview, a summary). Phones and narrow windows stack
 * the two.
 */
export default function AdminFormPage({
  backTo, backLabel, title, subtitle, aside, children,
}) {
  return (
    <div className="afp">
      <Link to={backTo} className="afp-back">
        <CaretLeft size={14} weight="bold" aria-hidden="true" /> {backLabel}
      </Link>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{title}</h1>
          {subtitle && <p className="admin-page-sub">{subtitle}</p>}
        </div>
      </div>
      <div className={`afp-body${aside ? ' has-aside' : ''}`}>
        <div className="admin-card afp-main">{children}</div>
        {aside && <aside className="afp-aside">{aside}</aside>}
      </div>
    </div>
  );
}

/** The edit page of something that is not there (deleted, or a wrong link). */
export function AdminFormMissing({ backTo, backLabel, what }) {
  return (
    <div className="afp">
      <Link to={backTo} className="afp-back">
        <CaretLeft size={14} weight="bold" aria-hidden="true" /> {backLabel}
      </Link>
      <div className="admin-card">
        <div className="admin-empty">
          <EmptyArt name="search" size={104} />
          <p>This {what} isn&apos;t here any more. It may have been deleted.</p>
          <Link to={backTo} className="admin-btn admin-btn-primary">{backLabel}</Link>
        </div>
      </div>
    </div>
  );
}

/** The edit page while what it edits is loading. */
export function AdminFormLoading({ backTo, backLabel }) {
  return (
    <div className="afp">
      <Link to={backTo} className="afp-back">
        <CaretLeft size={14} weight="bold" aria-hidden="true" /> {backLabel}
      </Link>
      <div className="admin-card"><div className="afp-loading">Loading…</div></div>
    </div>
  );
}
