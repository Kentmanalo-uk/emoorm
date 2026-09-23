import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flag, Storefront, Package, CheckCircle, Clock } from '@phosphor-icons/react';
import axios from '../lib/axios';
import './ProfileReports.css';

/** Report statuses, with the wording a reporter (not an admin) needs. */
const STATUS_META = {
  PENDING: { label: 'Pending review', tone: 'pending' },
  UNDER_REVIEW: { label: 'Under review', tone: 'review' },
  RESOLVED: { label: 'Resolved', tone: 'resolved' },
  DISMISSED: { label: 'Dismissed', tone: 'dismissed' },
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

/** What the report was filed against, as a link when there is one to give. */
function ReportTarget({ report }) {
  if (report.type === 'PRODUCT') {
    const name = report.product?.name || 'A product';
    return (
      <span className="rp-target">
        <Package size={14} weight="fill" />
        {report.product?.slug
          ? <Link to={`/product/${report.product.slug}`}>{name}</Link>
          : <span>{name}</span>}
      </span>
    );
  }
  const seller = report.reportedSeller;
  const name = seller?.store?.name || seller?.fullName || seller?.username || 'A seller';
  return (
    <span className="rp-target">
      <Storefront size={14} weight="fill" />
      {seller?.store?.slug
        ? <Link to={`/store/${seller.store.slug}`}>{name}</Link>
        : <span>{name}</span>}
    </span>
  );
}

/**
 * My Reports: what the person reported and what the municipal team did about
 * it. The endpoint has always existed; this is the first screen over it.
 */
export default function ProfileReports() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('id');

  const query = useQuery({
    queryKey: ['my-reports-page'],
    queryFn: async () => {
      const res = await axios.get('/reports/my/reports', { params: { pageSize: 50 } });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const reports = query.data || [];
  const error = query.error ? (query.error.message || 'Could not load your reports') : '';

  return (
    <div className="profile-page-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">My Reports</h1>
        <p className="profile-page-subtitle">
          Products and sellers you reported, and what your municipal team decided.
        </p>
      </header>

      <div className="profile-section">
        {query.isLoading ? (
          <p className="rp-muted">Loading your reports…</p>
        ) : error ? (
          <div className="empty-state">
            <p className="empty-state-text">Something went wrong</p>
            <p className="empty-state-hint">{error}</p>
            <button type="button" className="empty-state-button" onClick={() => query.refetch()}>
              Try again
            </button>
          </div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <Flag size={40} weight="fill" />
            <p className="empty-state-text">You have not reported anything</p>
            <p className="empty-state-hint">
              If a listing or a seller looks wrong, use Report on the product or store page. Your
              report goes to the municipal team that covers that seller, and it shows up here.
            </p>
            <Link to="/products" className="empty-state-button">Browse products</Link>
          </div>
        ) : (
          <ul className="rp-list">
            {reports.map((report) => {
              const meta = STATUS_META[report.status] || { label: report.status, tone: 'pending' };
              const settled = report.status === 'RESOLVED' || report.status === 'DISMISSED';
              return (
                <li
                  key={report.id}
                  className={`rp-card${report.id === highlightId ? ' is-target' : ''}`}
                >
                  <div className="rp-top">
                    <ReportTarget report={report} />
                    <span className={`rp-chip is-${meta.tone}`}>{meta.label}</span>
                  </div>

                  <p className="rp-reason">{report.reason}</p>
                  {report.description && <p className="rp-desc">{report.description}</p>}

                  <div className="rp-meta">
                    <span><Clock size={13} /> Filed {formatDate(report.createdAt)}</span>
                    {report.municipality?.name && <span>{report.municipality.name}</span>}
                    {settled && report.resolvedAt && (
                      <span>{meta.label} {formatDate(report.resolvedAt)}</span>
                    )}
                  </div>

                  {settled && report.resolutionNotes && (
                    <div className="rp-resolution">
                      <CheckCircle size={14} weight="fill" />
                      <div>
                        <span className="rp-resolution-label">What the team decided</span>
                        <p>{report.resolutionNotes}</p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
