import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ShareNetworkIcon, UserPlusIcon } from '../../../lib/icons';
import apiClient from '../../../api/client';
import { ENDPOINTS } from '../../../api/endpoints';
import { toast } from '../../../lib/toast';
import { invitePeso } from '../../../lib/invite';
import { openShare } from '../../ShareSheet';
import Select from '../../Select';
import { SheetButton } from '../../Sheet';
import { meStyles } from '../me/MeParts';
import MkField, { MkFieldRow, fieldStyles } from './MkField';
import { VoucherSwitch } from './ShopVouchers';
import { font, t, themed } from '../../../theme';

/*
 * Marketing: the shop's invite rewards (backend services/referral). A friend
 * who joins through this shop's invite link gets the welcome voucher; the
 * person who invited them gets the thank-you voucher once the friend's first
 * order here (of at least the minimum) is completed. The shop pays both
 * discounts on its own sales. Shown only while a super admin has invites on
 * (GET /referrals/my-shop answers enabled: false otherwise).
 */

const TYPES = [
  { value: 'FIXED', label: '₱ off' },
  { value: 'PERCENT', label: '% off' },
];

// Digits and one decimal point, as a number input takes them.
const decimal = (text) => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const whole = (text) => text.replace(/[^0-9]/g, '');
const str = (v) => (v === null || v === undefined ? '' : String(Number(v)));
const num = (v) => (v === '' ? null : Number(v));

const formOf = (program = {}) => ({
  isActive: Boolean(program.isActive),
  welcomeType: program.welcomeType || 'FIXED',
  welcomeValue: str(program.welcomeValue),
  rewardType: program.rewardType || 'FIXED',
  rewardValue: str(program.rewardValue),
  maxDiscount: str(program.maxDiscount),
  minOrderAmount: str(program.minOrderAmount),
  monthlyCap: str(program.monthlyCap),
});

export default function ShopInviteRewards() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(formOf());
  const [saving, setSaving] = useState(false);
  const [sellerLink, setSellerLink] = useState(null);

  useEffect(() => {
    let live = true;
    apiClient.get(ENDPOINTS.REFERRALS.MY_SHOP)
      .then((res) => {
        if (!live) return;
        const answer = res?.data || null;
        setData(answer);
        if (answer?.enabled) {
          setForm(formOf(answer.program || {}));
          // A seller with an open shop can invite other sellers too.
          apiClient.get(ENDPOINTS.REFERRALS.MINE)
            .then((me) => { if (live) setSellerLink(me?.data?.canInviteSellers ? me.data.sellerLink || null : null); })
            .catch(() => {});
        }
      })
      .catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, []);

  if (!data?.enabled) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const limits = data.limits || {};
  const stats = data.stats || {};
  const anyPercent = form.welcomeType === 'PERCENT' || form.rewardType === 'PERCENT';

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put(ENDPOINTS.REFERRALS.MY_SHOP, {
        isActive: form.isActive,
        welcomeType: form.welcomeType,
        welcomeValue: num(form.welcomeValue),
        rewardType: form.rewardType,
        rewardValue: num(form.rewardValue),
        maxDiscount: anyPercent ? num(form.maxDiscount) : null,
        minOrderAmount: num(form.minOrderAmount),
        monthlyCap: num(form.monthlyCap),
      });
      if (res?.data) {
        setData(res.data);
        setForm(formOf(res.data.program || {}));
      }
      toast.success('Invite rewards saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save the invite rewards');
    } finally {
      setSaving(false);
    }
  };

  const limitNote = [
    Number(limits.maxShopReward) > 0 ? `up to ${invitePeso(limits.maxShopReward)}` : null,
    Number(limits.maxShopPercent) > 0 ? `${Number(limits.maxShopPercent)}%` : null,
  ].filter(Boolean).join(' or ');

  const valueField = (typeKey, valueKey, label) => (
    <MkFieldRow>
      <MkField label={label}>
        <Select
          title={label}
          value={form[typeKey]}
          options={TYPES}
          onChange={(next) => set(typeKey, next)}
          style={fieldStyles.select}
          textStyle={fieldStyles.selectText}
        />
      </MkField>
      <MkField label={form[typeKey] === 'PERCENT' ? 'Percent' : 'Amount (₱)'}>
        <TextInput
          value={form[valueKey]}
          keyboardType="decimal-pad"
          onChangeText={(text) => set(valueKey, decimal(text))}
          accessibilityLabel={`${label} ${form[typeKey] === 'PERCENT' ? 'percent' : 'amount'}`}
          style={fieldStyles.input}
        />
      </MkField>
    </MkFieldRow>
  );

  return (
    <View style={meStyles.card}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Invite rewards</Text>
        <VoucherSwitch value={form.isActive} onChange={() => set('isActive', !form.isActive)} label="Invite rewards on" />
      </View>
      <Text style={styles.help}>
        You pay these discounts on your own sales. Friends get theirs when they join through your shop&apos;s invite
        link; the inviter gets theirs after the friend&apos;s first order here.
      </Text>

      {valueField('welcomeType', 'welcomeValue', "Friend's welcome")}
      {valueField('rewardType', 'rewardValue', "Your customer's thank-you")}
      <MkFieldRow>
        {anyPercent ? (
          <MkField label="Up to (₱)">
            <TextInput
              value={form.maxDiscount}
              keyboardType="decimal-pad"
              placeholder="No cap"
              placeholderTextColor={t.neutral[400]}
              onChangeText={(text) => set('maxDiscount', decimal(text))}
              style={fieldStyles.input}
            />
          </MkField>
        ) : null}
        <MkField label="Minimum order (₱)">
          <TextInput
            value={form.minOrderAmount}
            keyboardType="decimal-pad"
            placeholder="None"
            placeholderTextColor={t.neutral[400]}
            onChangeText={(text) => set('minOrderAmount', decimal(text))}
            style={fieldStyles.input}
          />
        </MkField>
      </MkFieldRow>
      <MkFieldRow>
        <MkField label="Thank-you vouchers a month">
          <TextInput
            value={form.monthlyCap}
            keyboardType="number-pad"
            placeholder="No limit"
            placeholderTextColor={t.neutral[400]}
            onChangeText={(text) => set('monthlyCap', whole(text))}
            style={fieldStyles.input}
          />
        </MkField>
      </MkFieldRow>
      {limitNote || limits.voucherDays ? (
        <Text style={styles.small}>
          {limitNote ? `Each voucher can be ${limitNote}.` : ''}
          {limitNote && limits.voucherDays ? ' ' : ''}
          {limits.voucherDays ? `Vouchers last ${limits.voucherDays} ${Number(limits.voucherDays) === 1 ? 'day' : 'days'}.` : ''}
        </Text>
      ) : null}

      <SheetButton variant="seller" primary label={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={save} style={styles.save} />

      <Text style={styles.stats}>
        {stats.joined || 0} joined through your shop · {stats.rewardedThisMonth || 0} thanked this month
      </Text>

      {sellerLink ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => openShare({ title: 'Sell on E-MOORM', text: 'Open your shop on E-MOORM with my invite.', url: sellerLink })}
          style={({ pressed }) => [styles.seller, pressed && meStyles.pressed]}
        >
          <UserPlusIcon size={22} weight="fill" color={t.primary[600]} />
          <View style={styles.sellerText}>
            <Text style={styles.sellerTitle}>Invite another seller</Text>
            <Text style={styles.small}>Both shops are shown higher in For You once theirs starts selling.</Text>
          </View>
          <ShareNetworkIcon size={18} color={t.primary[700]} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .sh-card-head
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  title: { fontSize: 15.5, lineHeight: 17.8, ...font(500), color: t.neutral[900] },
  help: { marginBottom: 12, fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[500] },
  small: { fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[500] },
  save: { flex: 0, marginTop: 12 },
  stats: { marginTop: 10, fontSize: 13, lineHeight: 20, ...font(400), color: t.neutral[600], textAlign: 'center' },
  seller: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginHorizontal: -16,
    paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  sellerText: { flex: 1, minWidth: 0, gap: 2 },
  sellerTitle: { fontSize: 14, lineHeight: 20, ...font(500), color: t.neutral[900] },
}));
