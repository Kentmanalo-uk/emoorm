import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Ticket, Plus, Trash, PencilSimple, ShareNetwork } from '../../lib/icons';
import axios from '../../lib/axios';
import PhoneSheet from './PhoneSheet';
import Skeleton from '../ui/Skeleton';
import LoadFailed from '../ui/LoadFailed';
import { useShare } from '../ShareSheet';
import { confirmAction } from '../../lib/confirm';
import { voucherSummary } from '../../lib/vouchers';
import './ShopVouchers.css';
import Select from '../ui/Select';

const EMPTY = { code: '', discountType: 'FIXED', discountValue: '', minOrderAmount: '', maxDiscount: '', usageLimit: '', expiresAt: '' };

// The voucher's last day as the date field shows it (Manila time).
const dayOf = (iso) => (iso
  ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  : '');
const numOrEmpty = (n) => (n == null ? '' : String(Number(n)));

/**
 * Marketing: the shop's own voucher codes. The shop pays the discount; a code
 * works only on this shop's orders and is shown on its page.
 *
 * A voucher can be edited later (amount, minimum, how many buyers, last day).
 * Its code and kind of discount stay as they are: orders already carry the
 * code, and a buyer may have it saved. "Share" sends the code with the shop
 * link.
 */
export default function ShopVouchers() {
  const { store } = useOutletContext() || {};
  const { share, shareSheet } = useShare();
  const [list, setList] = useState(null); // null loading, 'failed', or the vouchers
  const [editing, setEditing] = useState(null); // null closed, 'new', or the voucher being edited
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => axios.get('/vouchers/shop')
    .then((res) => setList(res.data?.items || []))
    .catch(() => setList('failed'));
  useEffect(() => { load(); }, []);

  const isNew = editing === 'new';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valueOk = Number(form.discountValue) > 0 && (form.discountType !== 'PERCENT' || Number(form.discountValue) <= 100);
  // A limit below the uses so far would end it at once.
  const usedSoFar = isNew ? 0 : Number(editing?.timesUsed || 0);
  const limitOk = form.usageLimit === '' || (Number.isInteger(Number(form.usageLimit)) && Number(form.usageLimit) >= Math.max(1, usedSoFar));
  const ready = /^[A-Za-z0-9_-]{3,32}$/.test(form.code.trim()) && valueOk && limitOk;

  const openNew = () => {
    setForm(EMPTY);
    setEditing('new');
  };
  const openEdit = (v) => {
    setForm({
      code: v.code,
      discountType: v.discountType,
      discountValue: numOrEmpty(v.discountValue),
      minOrderAmount: numOrEmpty(v.minOrderAmount),
      maxDiscount: numOrEmpty(v.maxDiscount),
      usageLimit: numOrEmpty(v.usageLimit),
      expiresAt: dayOf(v.expiresAt),
    });
    setEditing(v);
  };

  const save = async () => {
    setSaving(true);
    const body = {
      // The kind of discount goes with the amount, so a percent is checked as one.
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderAmount: form.minOrderAmount === '' ? null : Number(form.minOrderAmount),
      maxDiscount: form.discountType === 'PERCENT' && form.maxDiscount !== '' ? Number(form.maxDiscount) : null,
      usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
      // The end of that day, Manila time.
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+08:00`).toISOString() : null,
    };
    try {
      if (isNew) {
        await axios.post('/vouchers/shop', { ...body, code: form.code.trim(), perUserLimit: 1 });
        toast.success('Voucher created');
      } else {
        await axios.put(`/vouchers/shop/${editing.id}`, body);
        toast.success('Voucher saved');
      }
      setEditing(null);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.error(err.message || (isNew ? 'Could not create the voucher' : 'Could not save the voucher'));
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

  const shareCode = (v) => {
    const shopUrl = store?.slug ? `${window.location.origin}/store/${store.slug}` : window.location.origin;
    share({
      title: `${v.code} at ${store?.name || 'my shop'}`,
      text: `Use code ${v.code} at ${store?.name || 'my shop'} on Emoorm: ${voucherSummary(v)}.`,
      url: shopUrl,
    });
  };

  return (
    <section className="sh-card svc">
      <div className="sh-card-head">
        <h2>Shop vouchers</h2>
        <button type="button" className="svc-add" onClick={openNew}><Plus size={14} weight="bold" /> New</button>
      </div>
      {list === null ? (
        <Skeleton height={56} radius={12} />
      ) : list === 'failed' ? (
        <LoadFailed onRetry={() => { setList(null); load(); }} what="your vouchers" compact />
      ) : list.length === 0 ? (
        <p className="svc-empty">
          <Ticket size={20} weight="fill" />
          <span>Give buyers a code for money off your shop, like ₱20 off orders of ₱300. You pay the discount; buyers see the code on your shop page.</span>
        </p>
      ) : (
        <ul className="svc-list">
          {list.map((v) => {
            const expired = v.expiresAt && new Date(v.expiresAt) < new Date();
            const usedUp = v.usageLimit != null && v.timesUsed >= v.usageLimit;
            const live = v.isActive && !expired && !usedUp;
            return (
              <li key={v.id} className={`svc-item${live ? '' : ' is-off'}`}>
                <span className="svc-code">{v.code}</span>
                <span className="svc-text">
                  <b>{voucherSummary(v)}</b>
                  <small>
                    Used {v.timesUsed}{v.usageLimit ? ` of ${v.usageLimit}` : ''}
                    {v.expiresAt && ` · ${expired ? 'ended' : 'until'} ${new Date(v.expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                    {usedUp && ' · used up'}
                  </small>
                </span>
                <span className="svc-actions">
                  {live && (
                    <button type="button" className="svc-icon" onClick={() => shareCode(v)} aria-label={`Share ${v.code}`} title="Share code">
                      <ShareNetwork size={16} />
                    </button>
                  )}
                  <button type="button" className="svc-icon" onClick={() => openEdit(v)} aria-label={`Edit ${v.code}`} title="Edit">
                    <PencilSimple size={16} />
                  </button>
                  <label className="svc-switch" title={v.isActive ? 'On' : 'Off'}>
                    <input type="checkbox" checked={v.isActive} onChange={() => toggle(v)} aria-label={`${v.code} on`} />
                    <span />
                  </label>
                  <button type="button" className="svc-del" onClick={() => remove(v)} aria-label={`Delete ${v.code}`} title="Delete"><Trash size={16} /></button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <PhoneSheet
        open={editing !== null}
        title={isNew ? 'New shop voucher' : `Edit ${editing?.code || 'voucher'}`}
        onClose={() => setEditing(null)}
        footer={(
          <button type="button" className="scm-btn" disabled={!ready || saving} onClick={save}>
            {saving ? (isNew ? 'Creating…' : 'Saving…') : (isNew ? 'Create voucher' : 'Save changes')}
          </button>
        )}
      >
        {isNew ? (
          <label className="scm-field smk-field">
            Code buyers type
            <input value={form.code} maxLength={32} placeholder="e.g. MANGO20" onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} />
          </label>
        ) : (
          <p className="svc-fixed">
            <span className="svc-code">{form.code}</span>
            <span>The code and kind of discount stay the same. Make a new voucher for a different code.</span>
          </p>
        )}
        <div className="svc-row">
          <label className="scm-field smk-field">
            Discount
            <Select value={form.discountType} onChange={(e) => set('discountType', e.target.value)} disabled={!isNew}>
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
            <input type="number" inputMode="numeric" min={Math.max(1, usedSoFar)} placeholder="No limit" value={form.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} />
          </label>
          <label className="scm-field smk-field">
            Last day
            <input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </label>
        </div>
        {!limitOk && (
          <p className="smk-sheet-note svc-warn" role="alert">
            {usedSoFar > 0 ? `Already used ${usedSoFar} times: the limit can't be lower than that.` : 'Enter a whole number of buyers.'}
          </p>
        )}
        <p className="smk-sheet-note">Each buyer can use it once.</p>
      </PhoneSheet>
      {shareSheet}
    </section>
  );
}
