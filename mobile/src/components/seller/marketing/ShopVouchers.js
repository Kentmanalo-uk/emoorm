import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PlusIcon, TrashIcon } from '../../../lib/icons';
import apiClient from '../../../api/client';
import { toast } from '../../../lib/toast';
import Sheet, { SheetButton } from '../../Sheet';
import Select from '../../Select';
import LoadingSkeleton from '../../LoadingSkeleton';
import EmptyState from '../../EmptyState';
import OrderConfirmDialog from '../../orders/OrderConfirmDialog';
import { meStyles } from '../me/MeParts';
import MkField, { MkFieldRow, fieldStyles } from './MkField';
import VoucherDateSheet from './VoucherDateSheet';
import { dayLabel, shortDate, voucherSummary } from './marketingLib';
import { font, t, themed } from '../../../theme';
import { PageLoader } from '../../BrandLoader';

/*
 * Marketing: the shop's own voucher codes (web/src/components/seller/
 * ShopVouchers.jsx/.css). The shop pays the discount; a code works only on
 * this shop's orders and is shown on its page. New codes are made in a
 * Seller Center sheet; each code can be switched off and on, or deleted
 * (one already used is turned off instead and stays on those orders).
 */

const EMPTY = { code: '', discountType: 'FIXED', discountValue: '', minOrderAmount: '', maxDiscount: '', usageLimit: '', expiresAt: '' };

const DISCOUNT_TYPES = [
  { value: 'FIXED', label: '₱ off' },
  { value: 'PERCENT', label: '% off' },
];

// Digits and one decimal point, as a number input takes them.
const decimal = (text) => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const whole = (text) => text.replace(/[^0-9]/g, '');

/** The voucher's on/off switch (.svc-switch: 40×24, green when on). */
function VoucherSwitch({ value, onChange, label }) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: value ? 1 : 0, duration: 150, useNativeDriver: false }).start();
  }, [value, progress]);
  const bg = progress.interpolate({ inputRange: [0, 1], outputRange: [t.neutral[300], t.primary[600]] });
  const x = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={onChange}
    >
      <Animated.View style={[styles.switch, { backgroundColor: bg }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} />
      </Animated.View>
    </Pressable>
  );
}

export default function ShopVouchers() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => apiClient.get('/vouchers/shop')
    .then((res) => setList(res.data?.items || []))
    .catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valueOk = Number(form.discountValue) > 0 && (form.discountType !== 'PERCENT' || Number(form.discountValue) <= 100);
  const ready = /^[A-Za-z0-9_-]{3,32}$/.test(form.code.trim()) && valueOk;
  const percent = form.discountType === 'PERCENT';

  const create = async () => {
    setSaving(true);
    try {
      await apiClient.post('/vouchers/shop', {
        code: form.code.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: form.minOrderAmount === '' ? null : Number(form.minOrderAmount),
        maxDiscount: percent && form.maxDiscount !== '' ? Number(form.maxDiscount) : null,
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
      await apiClient.put(`/vouchers/shop/${v.id}`, { isActive: !v.isActive });
      load();
    } catch (err) {
      toast.error(err.message || 'Could not change the voucher');
    }
  };

  const remove = async () => {
    const v = removing;
    if (!v) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/vouchers/shop/${v.id}`);
      setRemoving(null);
      load();
    } catch (err) {
      setRemoving(null);
      toast.error(err.message || 'Could not delete the voucher');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={meStyles.card}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Shop vouchers</Text>
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [styles.add, pressed && meStyles.pressed]}>
          <PlusIcon size={14} weight="bold" color={t.primary[700]} />
          <Text style={styles.addText}>New</Text>
        </Pressable>
      </View>

      {list === null ? (
        <PageLoader size={40} minHeight={96} label="Loading vouchers" />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          art="vouchers"
          text="Give buyers a code for money off your shop, like ₱20 off orders of ₱300. You pay the discount; buyers see the code on your shop page."
        />
      ) : (
        <View>
          {list.map((v, i) => {
            const expired = v.expiresAt && new Date(v.expiresAt) < new Date();
            return (
              <View key={v.id} style={[styles.item, i > 0 && styles.itemLine, (!v.isActive || expired) && styles.itemOff]}>
                <Text style={styles.code}>{v.code}</Text>
                <View style={styles.text}>
                  <Text style={styles.summary}>{voucherSummary(v)}</Text>
                  <Text style={styles.small}>
                    Used {v.timesUsed}{v.usageLimit ? ` of ${v.usageLimit}` : ''}
                    {v.expiresAt ? ` · ${expired ? 'ended' : 'until'} ${shortDate(v.expiresAt)}` : ''}
                  </Text>
                </View>
                <VoucherSwitch value={Boolean(v.isActive)} onChange={() => toggle(v)} label={`${v.code} on`} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${v.code}`} onPress={() => setRemoving(v)} style={styles.del}>
                  <TrashIcon size={16} color={t.neutral[500]} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Sheet
        variant="seller"
        open={open}
        title="New shop voucher"
        dismissible={!saving}
        onClose={() => setOpen(false)}
        footer={(
          <SheetButton variant="seller" primary label={saving ? 'Creating…' : 'Create voucher'} disabled={!ready || saving} onPress={create} />
        )}
      >
        <MkField label="Code buyers type">
          <TextInput
            value={form.code}
            maxLength={32}
            placeholder="e.g. MANGO20"
            placeholderTextColor={t.neutral[400]}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(text) => set('code', text.toUpperCase().replace(/\s/g, ''))}
            style={fieldStyles.input}
          />
        </MkField>
        <MkFieldRow>
          <MkField label="Discount">
            <Select
              title="Discount"
              value={form.discountType}
              options={DISCOUNT_TYPES}
              onChange={(next) => set('discountType', next)}
              style={fieldStyles.select}
              textStyle={fieldStyles.selectText}
            />
          </MkField>
          <MkField label={percent ? 'Percent' : 'Amount (₱)'}>
            <TextInput
              value={form.discountValue}
              keyboardType="decimal-pad"
              onChangeText={(text) => set('discountValue', decimal(text))}
              style={fieldStyles.input}
            />
          </MkField>
        </MkFieldRow>
        <MkFieldRow>
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
          {percent ? (
            <MkField label="Most off (₱)">
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
        </MkFieldRow>
        <MkFieldRow>
          <MkField label="How many buyers">
            <TextInput
              value={form.usageLimit}
              keyboardType="number-pad"
              placeholder="No limit"
              placeholderTextColor={t.neutral[400]}
              onChangeText={(text) => set('usageLimit', whole(text))}
              style={fieldStyles.input}
            />
          </MkField>
          <MkField label="Last day">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Last day"
              onPress={() => setDateOpen(true)}
              style={[fieldStyles.input, styles.dateField]}
            >
              <Text style={[styles.dateText, !form.expiresAt && styles.datePlaceholder]} numberOfLines={1}>
                {form.expiresAt ? dayLabel(form.expiresAt) : 'None'}
              </Text>
            </Pressable>
          </MkField>
        </MkFieldRow>
        <Text style={fieldStyles.note}>Each buyer can use it once.</Text>

        <VoucherDateSheet
          open={dateOpen}
          value={form.expiresAt}
          onPick={(ymd) => { set('expiresAt', ymd); setDateOpen(false); }}
          onClose={() => setDateOpen(false)}
        />
      </Sheet>

      <OrderConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Delete ${removing.code}?` : ''}
        message={removing?.timesUsed ? 'It was already used, so it is turned off instead and stays on those orders.' : 'Buyers can no longer use it.'}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .sh-card-head
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  title: { fontSize: 15.5, lineHeight: 17.8, ...font(500), color: t.neutral[900] },
  // .svc-add
  add: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  addText: { fontSize: 13, lineHeight: 20.8, ...font(600), color: t.primary[700] },

  // .svc-item
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  itemLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  itemOff: { opacity: 0.55 },
  code: {
    paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: t.danger[300], borderRadius: 8,
    overflow: 'hidden', backgroundColor: t.danger[50], color: t.danger[700], fontSize: 13, lineHeight: 20.8, letterSpacing: 0.52, ...font(700),
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  summary: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  small: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  switch: { width: 40, height: 24, borderRadius: 999, justifyContent: 'center' },
  knob: { position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: t.neutral[0] },
  del: { padding: 6 },

  dateField: { justifyContent: 'center' },
  dateText: { fontSize: 16, lineHeight: 20.8, ...font(400), color: t.neutral[900] },
  datePlaceholder: { color: t.neutral[400] },
}));
