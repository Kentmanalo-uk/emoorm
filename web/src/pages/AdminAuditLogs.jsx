import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { ACTION_LABELS, actionLabel } from '../lib/auditActions';
import '../components/admin/AdminLayout.css';
import { useMunicipalities } from '../hooks/useReferenceData';

const ACTIONS = Object.keys(ACTION_LABELS);

export default function AdminAuditLogs() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '', municipalityId: '' });
  // Only a super admin uses the municipality filter, so the list is only
  // requested for them.
  const { municipalities } = useMunicipalities({ enabled: isSuperAdmin });
  const [isLoading, setIsLoading] = useState(true);

  const load = async (page = 1) => {
    setIsLoading(true);
    try {
      const params = { page, pageSize: 25 };
      if (filters.action) params.action = filters.action;
      if (filters.entity) params.entity = filters.entity;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (isSuperAdmin && filters.municipalityId) params.municipalityId = filters.municipalityId;
      const res = await axios.get('/audit-logs', { params });
      setLogs(res.data || []);
      setPagination(res.pagination || { page, pageSize: 25, total: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(1); }, []); // eslint-disable-line

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Audit Logs</h1>
          {!isSuperAdmin && (
            <p className="admin-page-sub">Actions recorded for your municipality</p>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Filter</h2>
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', padding: 16 }}>
          <select
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            className="admin-input"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
          <select
            value={filters.entity}
            onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value }))}
            className="admin-input"
          >
            <option value="">All entities</option>
            <option value="User">User</option>
            <option value="Product">Product</option>
            <option value="Store">Store</option>
            <option value="Order">Order</option>
            <option value="Report">Report</option>
            <option value="Municipality">Municipality</option>
            <option value="Announcement">Announcement</option>
          </select>
          {isSuperAdmin && (
            <select
              value={filters.municipalityId}
              onChange={(e) => setFilters((f) => ({ ...f, municipalityId: e.target.value }))}
              className="admin-input"
            >
              <option value="">All municipalities</option>
              {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            className="admin-input"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            className="admin-input"
          />
          <button className="admin-btn admin-btn-primary" onClick={() => load(1)}>Apply</button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">{pagination.total} record(s)</h2>
        </div>
        {isLoading ? (
          <div className="admin-empty"><p>Loading…</p></div>
        ) : logs.length === 0 ? (
          <div className="admin-empty"><p>No records match this filter.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Entity ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const d = l.details && typeof l.details === 'object' ? l.details : null;
                  const note = d?.reason || d?.note;
                  return (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(l.createdAt).toLocaleString('en-PH')}
                      </td>
                      <td style={{ fontSize: 12 }}>{l.userEmail || l.userId || '—'}</td>
                      <td>
                        <span className="admin-badge admin-badge-neutral" style={{ fontSize: 11 }} title={l.action}>
                          {actionLabel(l.action)}
                        </span>
                      </td>
                      <td>{l.entity}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        {l.entityId ? l.entityId.slice(0, 8) + '…' : '—'}
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 280 }}>
                        {note && (
                          <div style={{ fontSize: 12, color: 'var(--t-neutral-900, #0f172a)', marginBottom: 2 }}>
                            <strong>{d.reason ? 'Reason' : 'Note'}:</strong> {String(note)}
                          </div>
                        )}
                        <div
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-neutral-500, #64748b)' }}
                          title={l.details ? JSON.stringify(l.details) : ''}
                        >
                          {l.details ? JSON.stringify(l.details) : '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
            <button
              className="admin-btn"
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1)}
            >Prev</button>
            <span style={{ padding: '6px 12px' }}>
              Page {pagination.page} of {totalPages}
            </span>
            <button
              className="admin-btn"
              disabled={pagination.page >= totalPages}
              onClick={() => load(pagination.page + 1)}
            >Next</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
