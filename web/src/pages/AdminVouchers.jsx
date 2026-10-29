import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import EmptyArt from '../components/ui/EmptyArt';
import {
  Plus, PencilSimple as Edit3, Trash, Ticket, CalendarBlank, UsersThree, CheckCircle, Prohibit, Shuffle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import AdminFormPage, { AdminFormLoading, AdminFormMissing } from '../components/admin/AdminFormPage';
import { AdminPager, AdminSearch, CountTag } from '../components/admin/AdminBits';
import { shortDate } from '../components/admin/adminFormat';
import LoadFailed from '../components/ui/LoadFailed';
import Skeleton from '../components/ui/Skeleton';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminVouchers.css';
import { confirmAction } from '../lib/confirm';
import Select from '../components/ui/Select';
import { pesoShort } from '../lib/format';

const BASE = '/admin/vouchers';

const EMPTY_FORM = {
  id: null,
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderAmount: '',
  maxDiscount: '',
  usageLimit: '',
  perUserLimit: 1,
  startsAt: '',
  expiresAt: '',
  isActive: true,
};

// The voucher's day in local time (toISOString would shift it to UTC).
const toDateInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Where a voucher stands, from its switch, dates and uses: Disabled,
 * Scheduled (not started), Expired, Used up, or Active.
 */
const statusOf = (v, now = Date.now()) => {
  if (!v.isActive) return { label: 'Disabled', badge: 'admin-badge-dismissed' };
  if (v.startsAt && new Date(v.startsAt).getTime() > now) return { label: 'Scheduled', badge: 'admin-badge-review' };
  if (v.expiresAt && new Date(v.expiresAt).getTime() <= now) return { label: 'Expired', badge: 'admin-badge-rejected' };
  if (v.usageLimit && v.timesUsed >= v.usageLimit) return { label: 'Used up', badge: 'admin-badge-pending' };
  return { label: 'Active', badge: 'admin-badge-approved' };
};

// A code that is easy to read aloud: no 0/O or 1/I.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = () => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `EMOORM${[...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('')}`.slice(0, 14);
};

const formOf = (v) => ({
  id: v.id,
  code: v.code || '',
  description: v.description || '',
  discountType: v.discountType || 'PERCENT',
  discountValue: v.discountValue ?? '',
  minOrderAmount: v.minOrderAmount ?? '',
  maxDiscount: v.maxDiscount ?? '',
  usageLimit: v.usageLimit ?? '',
  perUserLimit: v.perUserLimit ?? 1,
  startsAt: toDateInput(v.startsAt),
  expiresAt: toDateInput(v.expiresAt),
  isActive: v.isActive !== false,
});

/*
 * Platform vouchers: the list. A voucher is made or edited on a page of its
 * own (/admin/vouchers/new, /admin/vouchers/<id>/edit).
 */
export default function AdminVouchers() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const creating = pathname.replace(/\/$/, '') === `${BASE}/new`;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // A voucher opened by its link that is not on the list's page.
  const [fetched, setFetched] = useState({ id: null, voucher: null, missing: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/vouchers', { params: { page, pageSize: 20, search }, quiet: true });
      setItems(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const listed = id ? items.find((v) => v.id === id) : null;
  useEffect(() => {
    if (!id || listed || loading) return undefined;
    let cancelled = false;
    axios.get(`/vouchers/${id}`, { quiet: true })
      .then((res) => { if (!cancelled) setFetched({ id, voucher: res.data, missing: !res.data }); })
      .catch(() => { if (!cancelled) setFetched({ id, voucher: null, missing: true }); });
    return () => { cancelled = true; };
  }, [id, listed, loading]);

  const saved = () => {
    navigate(BASE);
    load();
  };

  if (creating || id) {
    const editing = listed || (fetched.id === id ? fetched.voucher : null);
    let content;
    if (id && !editing && !(fetched.id === id && fetched.missing)) content = <AdminFormLoading backTo={BASE} backLabel="Vouchers" />;
    else if (id && !editing) content = <AdminFormMissing backTo={BASE} backLabel="Vouchers" what="voucher" />;
    else {
      content = (
        <VoucherForm
          key={id || 'new'}
          initial={editing ? formOf(editing) : EMPTY_FORM}
          onSaved={saved}
          onCancel={() => navigate(BASE)}
        />
      );
    }
    return <AdminLayout>{content}</AdminLayout>;
  }

  // Once used, a voucher stays (the orders that used it keep its discount):
  // it is switched off instead of deleted.
  const disable = async (v) => {
    if (!(await confirmAction({
      title: `Disable voucher "${v.code}"?`,
      message: `Buyers can no longer use it. The ${v.timesUsed} order${v.timesUsed === 1 ? '' : 's'} that used it keep their discount. You can switch it on again from its page.`,
      confirmLabel: 'Disable',
    }))) return;
    try {
      await axios.put(`/vouchers/${v.id}`, { isActive: false });
      toast.success(`${v.code} is disabled`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to disable');
    }
  };

  const remove = async (v) => {
    if (!(await confirmAction({ title: `Delete voucher "${v.code}"?`, message: 'Nobody has used it yet. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await axios.delete(`/vouchers/${v.id}`);
      toast.success('Voucher deleted');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  const formatDiscount = (v) =>
    v.discountType === 'PERCENT'
      ? `${Number(v.discountValue)}%`
      : pesoShort(v.discountValue);

  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Vouchers</h1>
          <p className="admin-page-sub">E-MOORM's own discount codes, usable in every shop. Shops make their own in the Seller Center.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate(`${BASE}/new`)}>
          <Plus size={14} /> New voucher
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Platform vouchers {total > 0 && <CountTag n={total} />}</h2>
          <div className="admin-toolbar">
            <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search code or description…" />
          </div>
        </div>
        {loading ? (
          <Skeleton.Table cols={7} rows={5} />
        ) : loadError ? (
          <LoadFailed onRetry={load} what="the vouchers" compact />
        ) : items.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="vouchers" size={104} />
            <p>{search ? 'No voucher matches that search.' : 'No platform vouchers yet.'}</p>
            {!search && (
              <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate(`${BASE}/new`)}>
                <Plus size={14} /> New voucher
              </button>
            )}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Min order</th>
                  <th>Used</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => {
                  const status = statusOf(v);
                  return (
                    <tr key={v.id}>
                      <td>
                        <div className="avc-code">
                          <strong translate="no">{v.code}</strong>
                          {v.description && <span>{v.description}</span>}
                        </div>
                      </td>
                      <td>{formatDiscount(v)}{v.maxDiscount ? ` (max ${pesoShort(v.maxDiscount)})` : ''}</td>
                      <td>{v.minOrderAmount ? pesoShort(v.minOrderAmount) : '—'}</td>
                      <td>{v.timesUsed}{v.usageLimit ? ` of ${v.usageLimit}` : ''}{v.perUserLimit ? ` · ${v.perUserLimit} per buyer` : ''}</td>
                      <td className="avc-dates">
                        {v.startsAt || v.expiresAt
                          ? `${v.startsAt ? shortDate(v.startsAt) : 'Now'} – ${v.expiresAt ? shortDate(v.expiresAt) : 'no end'}`
                          : 'No dates'}
                      </td>
                      <td><span className={`admin-badge ${status.badge}`}>{status.label}</span></td>
                      <td>
                        <div className="avc-actions">
                          <button type="button" className="admin-btn" onClick={() => navigate(`${BASE}/${v.id}/edit`)}><Edit3 size={12} /> Edit</button>
                          {v.timesUsed > 0 ? (
                            v.isActive && (
                              <button type="button" className="admin-btn avc-quiet" onClick={() => disable(v)} title="Used vouchers are kept for their orders">
                                <Prohibit size={12} /> Disable
                              </button>
                            )
                          ) : (
                            <button type="button" className="admin-btn avc-danger" onClick={() => remove(v)}><Trash size={12} /> Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPager page={page} totalPages={pageCount} total={total} onPage={setPage} />
      </div>
    </AdminLayout>
  );
}

/* ── A voucher's own page: the form, and what buyers get ───── */

const dayOf = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null);

function VoucherSummary({ form }) {
  const value = Number(form.discountValue);
  const hasValue = form.discountValue !== '' && value > 0;
  const off = !hasValue ? null : form.discountType === 'PERCENT' ? `${value}% off` : `${pesoShort(value)} off`;
  const cap = form.discountType === 'PERCENT' && form.maxDiscount !== '' && Number(form.maxDiscount) > 0
    ? ` (up to ${pesoShort(form.maxDiscount)})` : '';
  const min = form.minOrderAmount !== '' && Number(form.minOrderAmount) > 0
    ? ` on orders of ${pesoShort(form.minOrderAmount)} or more` : ' on any order';
  const uses = form.usageLimit !== '' && Number(form.usageLimit) > 0 ? `${Number(form.usageLimit)} times in all` : 'any number of times';
  const perUser = form.perUserLimit !== '' && Number(form.perUserLimit) > 0
    ? `, ${Number(form.perUserLimit) === 1 ? 'once' : `${Number(form.perUserLimit)} times`} per buyer` : '';
  const from = dayOf(form.startsAt);
  const until = dayOf(form.expiresAt);
  const when = from && until ? `From ${from} to ${until}` : from ? `From ${from}, with no end date` : until ? `Until ${until}` : 'No start or end date';

  return (
    <div className="admin-card afp-panel">
      <h2 className="afp-panel-title">What buyers get</h2>
      <ul className="afp-facts">
        <li><Ticket size={15} weight="fill" aria-hidden="true" /><span><strong translate="no">{form.code.trim() || 'CODE'}</strong>: {off ? `${off}${cap}${min}` : 'set the discount to see it here'}.</span></li>
        <li><UsersThree size={15} weight="fill" aria-hidden="true" /><span>Can be used {uses}{perUser}.</span></li>
        <li><CalendarBlank size={15} weight="fill" aria-hidden="true" /><span>{when}.</span></li>
        <li><CheckCircle size={15} weight="fill" aria-hidden="true" /><span>{form.isActive ? 'Active: buyers can use it at checkout.' : 'Disabled: nobody can use it until it is set to Active.'}</span></li>
      </ul>
      <p className="afp-panel-note">Platform vouchers work in every shop; E-MOORM's discount, not the seller's.</p>
    </div>
  );
}

function VoucherForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  useUnsavedChanges(!saving && JSON.stringify(form) !== JSON.stringify(initial));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: form.minOrderAmount === '' ? null : Number(form.minOrderAmount),
        maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        perUserLimit: form.perUserLimit === '' ? null : Number(form.perUserLimit),
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        isActive: !!form.isActive,
      };
      if (form.id) {
        await axios.put(`/vouchers/${form.id}`, payload);
        toast.success('Voucher updated');
      } else {
        await axios.post('/vouchers', payload);
        toast.success('Voucher created');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to save voucher');
      setSaving(false);
    }
  };

  return (
    <AdminFormPage
      backTo={BASE}
      backLabel="Vouchers"
      title={form.id ? `Edit voucher ${initial.code}` : 'New voucher'}
      subtitle="A discount code buyers enter at checkout, in any shop."
      aside={<VoucherSummary form={form} />}
    >
      <form onSubmit={submit} className="avc-form">
        <div className="avc-row is-wide">
          <label className="avc-field">
            <span className="avc-label">Code</span>
            <span className="avc-code-row">
              <input
                className="admin-input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SAVE10"
                maxLength={32}
                required
              />
              {!initial.id && (
                <button type="button" className="admin-btn" onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}>
                  <Shuffle size={13} /> Generate
                </button>
              )}
            </span>
          </label>
          <label className="avc-field">
            <span className="avc-label">Discount type</span>
            <Select
              className="admin-input"
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value })}
            >
              <option value="PERCENT">Percent (%)</option>
              <option value="FIXED">Fixed amount (₱)</option>
            </Select>
          </label>
        </div>

        <label className="avc-field">
          <span className="avc-label">Description (optional)</span>
          <input
            className="admin-input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={300}
          />
        </label>

        <div className="avc-row">
          <label className="avc-field">
            <span className="avc-label">Discount value</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="admin-input"
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              required
            />
          </label>
          <label className="avc-field">
            <span className="avc-label">Min order (₱)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="admin-input"
              value={form.minOrderAmount}
              onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
            />
          </label>
          <label className="avc-field">
            <span className="avc-label">Max discount (₱)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="admin-input"
              value={form.maxDiscount}
              onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
              placeholder="No cap"
            />
          </label>
        </div>

        <div className="avc-row is-narrow">
          <label className="avc-field">
            <span className="avc-label">Usage limit</span>
            <input
              type="number"
              min="1"
              className="admin-input"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder="Unlimited"
            />
          </label>
          <label className="avc-field">
            <span className="avc-label">Per user</span>
            <input
              type="number"
              min="1"
              className="admin-input"
              value={form.perUserLimit}
              onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
            />
          </label>
          <label className="avc-field">
            <span className="avc-label">Starts</span>
            <input
              type="date"
              className="admin-input"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>
          <label className="avc-field">
            <span className="avc-label">Expires</span>
            <input
              type="date"
              className="admin-input"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
        </div>

        <label className="avc-check">
          <input
            type="checkbox"
            checked={!!form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span className="avc-label">Active</span>
        </label>

        <div className="afp-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create voucher'}
          </button>
          <button type="button" className="admin-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AdminFormPage>
  );
}
