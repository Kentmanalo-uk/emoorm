import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Ticket, Plus, Trash } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import PhoneSheet from './PhoneSheet';
import Skeleton from '../ui/Skeleton';
import { confirmAction } from '../../lib/confirm';
import { voucherSummary } from '../../lib/vouchers';
import './ShopVouchers.css';
import Select from '../ui/Select';

const EMPTY = { code: '', discountType: 'FIXED', discountValue: '', minOrderAmount: '', maxDiscount: '', usageLimit: '', expiresAt: '' };

/**
 * Marketing: the shop's own voucher codes. The shop pays the discount; a code
 * works only on this shop's orders and is shown on its page.
 */
export default function ShopVouchers() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => axios.get('/vouchers/shop')
    .then((res) => setList(res.data?.items || []))
    .catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valueOk = Number(form.discountValue) > 0 && (form.discountType !== 'PERCENT' || Number(form.discountValue) <= 100);
  const ready = /^[A-Za-z0-9_-]{3,32}$/.test(form.code.trim()) && valueOk;

  const create = async () => {
    setSaving(true);
    try {
      await axios.post('/vouchers/shop', {
        code: form.code.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: form.minOrderAmount === '' ? null : Number(form.minOrderAmount),
        maxDiscount: form.discountType === 'PERCENT' && form.maxDiscount !== '' ? Number(form.maxDiscount) : null,
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        perUserLimit: 1,
        // The end of that day, Manila time.
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+08:00`).toISOString() : null,
      });
      toast.success('Voucher created');
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not create the voucher');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (v) => {
    try {
      await axios.put(`/vouchers/shop/${v.id}`, { isActive: !v.isActive });
      load();
    } catch (err) {
      toast.error(err.message || 'Could not change the voucher');
    }
  };

  const remove = async (v) => {
    if (!(await confirmAction({ title: `Delete ${v.code}?`, message: v.timesUsed ? 'It was already used, so it is turned off instead and stays on those orders.' : 'Buyers can no longer use it.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await axios.delete(`/vouchers/shop/${v.id}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not delete the voucher');
    }
  };

  return (
    <section className="sh-card svc">
      <div className="sh-card-head">
        <h2>Shop vouchers</h2>
        <button type="button" className="svc-add" onClick={() => setOpen(true)}><Plus size={14} weight="bold" /> New</button>
      </div>
      {list === null ? (
        <Skeleton height={56} radius={12} />
      ) : list.length === 0 ? (
        <p className="svc-empty">
          <Ticket size={20} weight="fill" />
          <span>Give buyers a code for money off your shop, like ₱20 off orders of ₱300. You pay the discount; buyers see the code on your shop page.</span>
        </p>
      ) : (
        <ul className="svc-list">
          {list.map((v) => {
            const expired = v.expiresAt && new Date(v.expiresAt) < new Date();
            return (
              <li key={v.id} className={`svc-item${!v.isActive || expired ? ' is-off' : ''}`}>
                <span className="svc-code">{v.code}</span>
                <span className="svc-text">
                  <b>{voucherSummary(v)}</b>
                  <small>
                    Used {v.timesUsed}{v.usageLimit ? ` of ${v.usageLimit}` : ''}
                    {v.expiresAt && ` · ${expired ? 'ended' : 'until'} ${new Date(v.expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                  </small>
                </span>
                <label className="svc-switch" title={v.isActive ? 'On' : 'Off'}>
                  <input type="checkbox" checked={v.isActive} onChange={() => toggle(v)} aria-label={`${v.code} on`} />
                  <span />
                </label>
                <button type="button" className="svc-del" onClick={() => remove(v)} aria-label={`Delete ${v.code}`}><Trash size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <PhoneSheet
        open={open}
        title="New shop voucher"
        onClose={() => setOpen(false)}
        footer={(
          <button type="button" className="scm-btn" disabled={!ready || saving} onClick={create}>
            {saving ? 'Creating…' : 'Create voucher'}
          </button>
        )}
      >
        <label className="scm-field smk-field">
          Code buyers type
          <input value={form.code} maxLength={32} placeholder="e.g. MANGO20" onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} />
        </label>
        <div className="svc-row">
          <label className="scm-field smk-field">
            Discount
            <Select value={form.discountType} onChange={(e) => set('discountType', e.target.value)}>
              <option value="FIXED">₱ off</option>
              <option value="PERCENT">% off</option>
            </Select>
          </label>
          <label className="scm-field smk-field">
            {form.discountType === 'PERCENT' ? 'Percent' : 'Amount (₱)'}
            <input type="number" inputMode="decimal" min="0" value={form.discountValue} onChange={(e) => set('discountValue', e.target.value)} />
          </label>
        </div>
        <div className="svc-row">
          <label className="scm-field smk-field">
            Minimum order (₱)
            <input type="number" inputMode="decimal" min="0" placeholder="None" value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} />
          </label>
          {form.discountType === 'PERCENT' && (
            <label className="scm-field smk-field">
              Most off (₱)
              <input type="number" inputMode="decimal" min="0" placeholder="No cap" value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
            </label>
          )}
        </div>
        <div className="svc-row">
          <label className="scm-field smk-field">
            How many buyers
            <input type="number" inputMode="numeric" min="1" placeholder="No limit" value={form.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} />
          </label>
          <label className="scm-field smk-field">
            Last day
            <input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </label>
        </div>
        <p className="smk-sheet-note">Each buyer can use it once.</p>
      </PhoneSheet>
    </section>
  );
}
