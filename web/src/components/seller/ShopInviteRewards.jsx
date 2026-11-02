import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Gift, PencilSimple, ShareNetwork } from '../../lib/icons';
import axios from '../../lib/axios';
import PhoneSheet from './PhoneSheet';
import Skeleton from '../ui/Skeleton';
import Select from '../ui/Select';
import { useShare } from '../ShareSheet';
import { pesos, rewardText } from '../../lib/invite';
import './ShopVouchers.css';

const numOrEmpty = (n) => (n == null ? '' : String(Number(n)));

/**
 * Marketing: the shop's invite rewards (services/referral). A friend who
 * joins through the shop's invite link gets the welcome voucher; whoever
 * invited them gets the thank-you voucher after the friend's first order
 * here. The shop pays both discounts, on its own sales. Hidden while the
 * super admin has invites off.
 *
 * Also "Invite another seller", when this seller can (both shops shown
 * higher once the new shop has served a few buyers).
 */
export default function ShopInviteRewards() {
  const { share, shareSheet } = useShare();
  const [data, setData] = useState(null); // null loading, false hidden
  const [mine, setMine] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => axios.get('/referrals/my-shop')
    .then((res) => setData(res.data?.enabled ? res.data : false))
    .catch(() => setData(false));
  useEffect(() => {
    load();
    axios.get('/referrals/me').then((res) => setMine(res.data?.enabled ? res.data : null)).catch(() => {});
  }, []);

  if (data === false) return null;
  if (data === null) return <section className="sh-card svc" id="invites"><Skeleton height={56} radius={12} /></section>;

  const { program, limits, stats } = data;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const percent = form && (form.welcomeType === 'PERCENT' || form.rewardType === 'PERCENT');

  const openEdit = () => {
    setForm({
      welcomeType: program.welcomeType,
      welcomeValue: numOrEmpty(program.welcomeValue),
      rewardType: program.rewardType,
      rewardValue: numOrEmpty(program.rewardValue),
      maxDiscount: numOrEmpty(program.maxDiscount),
      minOrderAmount: numOrEmpty(program.minOrderAmount),
      monthlyCap: numOrEmpty(program.monthlyCap),
    });
    setEditing(true);
  };

  const saveBody = async (body, done) => {
    setSaving(true);
    try {
      const res = await axios.put('/referrals/my-shop', body);
      setData(res.data);
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not save the invite rewards');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const ok = await saveBody({
      welcomeType: form.welcomeType,
      welcomeValue: Number(form.welcomeValue),
      rewardType: form.rewardType,
      rewardValue: Number(form.rewardValue),
      maxDiscount: percent && form.maxDiscount !== '' ? Number(form.maxDiscount) : null,
      minOrderAmount: form.minOrderAmount === '' ? 0 : Number(form.minOrderAmount),
      monthlyCap: Number(form.monthlyCap),
    }, 'Invite rewards saved');
    if (ok) setEditing(false);
  };

  const max = (type) => (type === 'PERCENT' ? `${limits.maxShopPercent}%` : pesos(limits.maxShopReward));

  return (
    <section className="sh-card svc" id="invites">
      <div className="sh-card-head">
        <h2>Invite rewards</h2>
        <label className="svc-switch" title={program.isActive ? 'On' : 'Off'}>
          <input
            type="checkbox"
            checked={program.isActive}
            disabled={saving}
            onChange={() => saveBody({ isActive: !program.isActive }, program.isActive ? 'Invite rewards are off' : 'Invite rewards are on')}
            aria-label="Invite rewards on"
          />
          <span />
        </label>
      </div>
      <p className="svc-empty">
        <Gift size={20} weight="fill" />
        <span>
          Friends who join through your shop&apos;s invite link get a welcome voucher; whoever invited them gets a thank-you voucher after the friend&apos;s first order here. You pay these discounts on your own sales.
        </span>
      </p>
      <ul className="svc-list">
        <li className={`svc-item${program.isActive ? '' : ' is-off'}`}>
          <span className="svc-text">
            <b>Friend: {rewardText(program.welcomeType, program.welcomeValue, program.maxDiscount)} · Inviter: {rewardText(program.rewardType, program.rewardValue, program.maxDiscount)}</b>
            <small>
              {Number(program.minOrderAmount) > 0 ? `Orders from ${pesos(program.minOrderAmount)}` : 'Any order'}
              {` · up to ${program.monthlyCap} thank-yous a month · vouchers last ${limits.voucherDays} days`}
            </small>
            <small>{stats.joined} joined through your shop · {stats.rewardedThisMonth} thanked this month</small>
          </span>
          <span className="svc-actions">
            <button type="button" className="svc-icon" onClick={openEdit} aria-label="Edit invite rewards" title="Edit">
              <PencilSimple size={16} />
            </button>
          </span>
        </li>
        {mine?.canInviteSellers && mine.sellerLink && (
          <li className="svc-item">
            <span className="svc-text">
              <b>Invite another seller</b>
              <small>When their shop has served {mine.limits.sellerOrdersToQualify} buyers, both shops are shown higher in For You for {mine.limits.boostDays} days.</small>
            </span>
            <span className="svc-actions">
              <button
                type="button"
                className="svc-icon"
                onClick={() => share({ title: 'Sell on Emoorm', text: 'Open your shop on Emoorm, the online market of Oriental Mindoro.', url: mine.sellerLink })}
                aria-label="Share a seller invite"
                title="Share"
              >
                <ShareNetwork size={16} />
              </button>
            </span>
          </li>
        )}
      </ul>

      <PhoneSheet
        open={editing}
        title="Invite rewards"
        onClose={() => setEditing(false)}
        footer={(
          <button type="button" className="scm-btn" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      >
        {form && (
          <>
            <div className="svc-row">
              <label className="scm-field smk-field">
                Friend&apos;s welcome
                <Select value={form.welcomeType} onChange={(e) => set('welcomeType', e.target.value)}>
                  <option value="FIXED">₱ off</option>
                  <option value="PERCENT">% off</option>
                </Select>
              </label>
              <label className="scm-field smk-field">
                {form.welcomeType === 'PERCENT' ? 'Percent' : 'Amount (₱)'}
                <input type="number" inputMode="decimal" min="0" value={form.welcomeValue} onChange={(e) => set('welcomeValue', e.target.value)} />
              </label>
            </div>
            <div className="svc-row">
              <label className="scm-field smk-field">
                Inviter&apos;s thank-you
                <Select value={form.rewardType} onChange={(e) => set('rewardType', e.target.value)}>
                  <option value="FIXED">₱ off</option>
                  <option value="PERCENT">% off</option>
                </Select>
              </label>
              <label className="scm-field smk-field">
                {form.rewardType === 'PERCENT' ? 'Percent' : 'Amount (₱)'}
                <input type="number" inputMode="decimal" min="0" value={form.rewardValue} onChange={(e) => set('rewardValue', e.target.value)} />
              </label>
            </div>
            <div className="svc-row">
              <label className="scm-field smk-field">
                Minimum order (₱)
                <input type="number" inputMode="decimal" min="0" placeholder="None" value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} />
              </label>
              {percent && (
                <label className="scm-field smk-field">
                  Most off (₱)
                  <input type="number" inputMode="decimal" min="0" placeholder="No cap" value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
                </label>
              )}
            </div>
            <label className="scm-field smk-field">
              Thank-you vouchers a month
              <input type="number" inputMode="numeric" min="1" value={form.monthlyCap} onChange={(e) => set('monthlyCap', e.target.value)} />
            </label>
            <p className="smk-sheet-note">
              Each voucher can be at most {max('FIXED')} or {max('PERCENT')} off, works only at your shop and lasts {limits.voucherDays} days.
            </p>
          </>
        )}
      </PhoneSheet>
      {shareSheet}
    </section>
  );
}
