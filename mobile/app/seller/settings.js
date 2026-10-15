import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AirplaneTiltIcon, ArrowCounterClockwiseIcon, CaretRightIcon, ClockIcon, IdentificationCardIcon, MapPinIcon, MoneyIcon,
  MopedIcon, PaintBrushIcon, QrCodeIcon, StorefrontIcon, TrashIcon, TruckIcon, UserIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import SellerPage from '../../src/components/seller/SellerPage';
import { useSellerShell } from '../../src/components/seller/SellerShell';
import OrderConfirmDialog from '../../src/components/orders/OrderConfirmDialog';
import EmptyState from '../../src/components/EmptyState';
import { AwayForm, HoursForm } from '../../src/components/seller/settings/ShopHoursCards';
import { SellerButton } from '../../src/components/seller/settings/SettingsCard';
import { MeList, MeRow, meStyles } from '../../src/components/seller/me/MeParts';
import { SfSwitch } from '../../src/components/seller/fulfillment/FulfillmentParts';
import { qrMethod } from '../../src/components/seller/me/qrPayment';
import { awayUntil, shortDate, weekLines } from '../../src/components/shop/shopHours';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';
import { PageLoader } from '../../src/components/BrandLoader';

/*
 * /seller/settings — Shop Settings (web src/pages/SellerSettings.jsx +
 * SellerSettings.css, phones): everything about how the shop runs, as the
 * Me page's lists (MeList / MeRow).
 *   Shop        profile, look, Shop QR, Away mode (on / off here)
 *   Selling     opening hours (edited here), delivery & pickup, MoorMove
 *               riders and cash on delivery (on / off here), payment options
 *   Account     identity check
 *   Danger zone deleting the shop, with 15 days to cancel
 * Rows with their own page open it; on / off settings save at once and
 * flip back if saving fails.
 *
 * Differences from the website: no "Notifications on this device" (web
 * push) and no Language row (Google Translate), which the app does not have.
 *
 * What this page saves also goes into the Seller Center's shared shop
 * (useSellerShell().setStore), so the rest of the app sees it at once.
 */

const MODE_HINTS = { DELIVERY: 'Delivery', PICKUP: 'Pickup', BOTH: 'Both' };

// A number as toLocaleString('en-PH') prints it: 1,234.5 (up to 3 decimals).
const plainNumber = (n) => {
  const [whole, part] = String(Math.round(Number(n) * 1000) / 1000).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part ? `.${part}` : ''}`;
};

/** A row whose label has a line under it, ending in `end` (a switch or a chevron). */
function TwoLineRow({
  icon: Icon, label, sub, warn = false, danger = false, onPress, end, first = false, accessible,
}) {
  const ink = danger ? t.danger[600] : t.neutral[900];
  return (
    <Pressable
      accessible={accessible}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [meStyles.row, !first && meStyles.rowLine, pressed && meStyles.pressed]}
    >
      <View style={meStyles.rowIcon}><Icon size={19} weight="fill" color={ink} /></View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, warn && meStyles.rowWarn]}>{sub}</Text> : null}
      </View>
      {end}
    </Pressable>
  );
}

/** A row with a switch: saves as soon as it is flipped. */
function ToggleRow({ value, onChange, label, ...rest }) {
  return (
    <TwoLineRow
      {...rest}
      label={label}
      accessible={false}
      onPress={() => onChange(!value)}
      end={<SfSwitch value={value} onValueChange={onChange} label={label} />}
    />
  );
}

export default function SellerSettingsScreen() {
  const router = useRouter();
  const { setStore: setShellStore, setup, refreshSetup } = useSellerShell();
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // On / off settings being saved, so a second tap waits for the first.
  const [saving, setSaving] = useState({});
  const [awayOpen, setAwayOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  // MoorMove riders: offered only while the super admin has them on and
  // the server can reach MoorMove (web lib/moormove useMoormove).
  const [ridersOn, setRidersOn] = useState(false);

  const loadStore = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/stores/my/store');
      setStore(res.data);
    } catch {
      setStore(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadStore(); }, [loadStore]);

  useEffect(() => {
    let cancelled = false;
    apiClient.get('/app-settings')
      .then((res) => (res?.data?.moormoveEnabled === true
        ? apiClient.get('/moormove/status').then((s) => s?.data?.enabled === true)
        : false))
      .then((on) => { if (!cancelled) setRidersOn(on); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The saved shop, here and in the Seller Center's shared copy.
  const applySaved = (next) => {
    if (!next) return;
    setStore((s) => ({ ...s, ...next }));
    setShellStore((prev) => (prev ? { ...prev, ...next } : prev));
  };

  // Flip an on / off setting at once, and put it back if saving fails.
  const flip = async (changes, failMessage) => {
    const key = Object.keys(changes).join(',');
    if (saving[key]) return;
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, store[k]]));
    setSaving((s) => ({ ...s, [key]: true }));
    setStore((s) => ({ ...s, ...changes }));
    try {
      const res = await apiClient.put(`/stores/${store.id}`, changes);
      applySaved(res.data);
      refreshSetup?.();
    } catch (err) {
      setStore((s) => ({ ...s, ...before }));
      toast.error(err.message || failMessage);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const confirmRequestDeletion = async () => {
    setIsSubmitting(true);
    try {
      const res = await apiClient.delete(`/stores/${store.id}`);
      applySaved(res.data);
      toast.success('Shop deletion scheduled. It is now hidden from buyers.');
    } catch (err) {
      toast.error(err.message || 'Could not schedule deletion');
    } finally {
      setIsSubmitting(false);
      setDeleteConfirm(false);
    }
  };

  const confirmCancelDeletion = async () => {
    setIsSubmitting(true);
    try {
      const res = await apiClient.post(`/stores/${store.id}/cancel-deletion`);
      applySaved(res.data);
      toast.success('Deletion cancelled. Your shop is active again.');
    } catch (err) {
      toast.error(err.message || 'Could not cancel deletion');
    } finally {
      setIsSubmitting(false);
      setCancelConfirm(false);
    }
  };

  if (isLoading || !store) {
    return (
      <SellerPage contentStyle={!isLoading ? styles.grow : undefined}>
        {isLoading
          ? <PageLoader label="Loading settings" />
          : <EmptyState page art="launch" text="You don't have a shop yet. Create one from Shop Profile first." />}
      </SellerPage>
    );
  }

  const go = (to) => () => router.push(to);
  const pendingDeletion = !!store.deletionRequestedAt;
  const daysLeft = store.deletionDaysRemaining;
  const deletionDate = pendingDeletion
    ? new Date(store.deletionScheduledAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const canShare = Boolean(store.slug && store.isApproved !== false);

  // Away: no new orders until the date the shop is back.
  const away = awayUntil(store);
  const awaySub = away
    ? `Away until ${shortDate(away)}${store.vacationNote ? ` · “${store.vacationNote}”` : ''}`
    : awayOpen ? 'Pick the day you are back' : 'Off: taking orders';
  const onAway = (on) => {
    if (away && !on) {
      setAwayOpen(false);
      flip({ vacationUntil: null, vacationNote: null }, 'Could not turn off away mode');
    } else {
      setAwayOpen(on);
    }
  };

  const hours = weekLines(store);

  // Delivery & payment: what is set now, and the parts still missing.
  const mode = store.fulfillmentMode || 'DELIVERY';
  const delivers = mode !== 'PICKUP';
  const picksUp = mode !== 'DELIVERY';
  const pickupSet = Boolean(String(store.pickupAddress || '').trim());
  const stepDone = (key) => setup?.steps?.find((step) => step.key === key)?.done;
  const deliverySet = !setup || (stepDone('delivery-areas') !== false && stepDone('delivery-fee') !== false);
  const fee = store.deliveryFee == null ? null : Number(store.deliveryFee);
  // How the shop charges for its own delivery (deliveryQuote.service).
  const feeHint = {
    FREE: 'Free',
    FLAT: fee === null ? 'Same fee' : fee === 0 ? 'Free' : `₱${plainNumber(fee)}`,
    PER_TOWN: 'Per town',
    PER_BARANGAY: 'Per barangay',
    PER_KM: 'By distance',
  }[store.deliveryFeeMode] || (fee === null ? 'Per place' : fee === 0 ? 'Free' : `₱${plainNumber(fee)}`);
  const cod = store.acceptsCod !== false;
  const qr = Boolean(store.paymentQrImage);
  const ways = [cod && 'Cash', qr && qrMethod(store.paymentQrType).label].filter(Boolean);
  const onCod = (on) => {
    if (!on && !qr) {
      toast.error('Add a QR code in Payment options first, so buyers can still pay.');
      return;
    }
    flip({ acceptsCod: on }, 'Could not change cash on delivery');
  };

  // MoorMove riders: for a shop that delivers.
  const riders = store.moormoveEnabled !== false;
  const pinned = store.latitude != null && store.longitude != null;
  const ridersSub = !riders ? 'Off' : pinned ? 'Buyers can pick a rider at checkout' : 'Pin your shop in Delivery so riders can find it';

  const identity = setup?.steps?.find((step) => step.key === 'identity');
  const identityHint = identity?.done ? 'Verified' : identity?.status === 'FAILED' ? 'Try again' : 'Not yet';

  return (
    <SellerPage>
      <View style={styles.body}>
        {pendingDeletion ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCancelConfirm(true)}
            style={({ pressed }) => [styles.pendingLine, pressed && styles.pendingLinePressed]}
          >
            <Text style={styles.pendingLineText}>
              {`Your shop is hidden and will be deleted on ${deletionDate}. `}
              <Text style={styles.pendingLineLink}>Cancel deletion</Text>
            </Text>
          </Pressable>
        ) : null}

        <MeList title="Shop">
          <MeRow first icon={UserIcon} label="Shop profile" hint="Name, logo, location" onPress={go('/seller/store')} />
          <MeRow icon={PaintBrushIcon} label="Decorate my shop" onPress={go('/seller/decorate')} />
          {canShare ? <MeRow icon={QrCodeIcon} label="Shop QR" hint="Print for your stall" onPress={go('/seller/shop-qr')} /> : null}
          <ToggleRow
            icon={AirplaneTiltIcon}
            label="Away mode"
            sub={awaySub}
            warn={Boolean(away)}
            value={Boolean(away) || awayOpen}
            onChange={onAway}
          />
          {awayOpen && !away ? <AwayForm store={store} onSaved={applySaved} onDone={() => setAwayOpen(false)} /> : null}
        </MeList>

        <MeList title="Selling">
          <TwoLineRow
            first
            icon={ClockIcon}
            label="Opening hours"
            sub={hours.length ? hours.join(', ') : 'Not set'}
            warn={!hours.length}
            onPress={() => setHoursOpen((o) => !o)}
            end={(
              <View style={hoursOpen ? styles.chevOpen : null}>
                <CaretRightIcon size={16} color={t.neutral[300]} />
              </View>
            )}
          />
          {hoursOpen ? <HoursForm store={store} onSaved={applySaved} /> : null}
          <MeRow icon={TruckIcon} label="Delivery & pickup" hint={MODE_HINTS[mode] || 'Delivery'} onPress={go('/seller/fulfillment/method')} />
          {picksUp ? (
            <MeRow
              icon={StorefrontIcon}
              label="Pickup spot"
              hint={pickupSet ? null : 'Not set'}
              warn={!pickupSet}
              onPress={go('/seller/fulfillment/pickup')}
            />
          ) : null}
          {delivers ? (
            <MeRow
              icon={MapPinIcon}
              label="Delivery: couriers, areas & fees"
              hint={deliverySet ? feeHint : 'Not set'}
              warn={!deliverySet}
              onPress={go('/seller/fulfillment/delivery')}
            />
          ) : null}
          {ridersOn && delivers ? (
            <ToggleRow
              icon={MopedIcon}
              label="MoorMove riders"
              sub={ridersSub}
              warn={riders && !pinned}
              value={riders}
              onChange={(on) => flip({ moormoveEnabled: on }, 'Could not change MoorMove riders')}
            />
          ) : null}
          <MeRow
            icon={QrCodeIcon}
            label="Payment options"
            hint={ways.length ? ways.join(' · ') : 'Not set'}
            warn={!ways.length}
            onPress={go('/seller/fulfillment/payment')}
          />
          <ToggleRow
            icon={MoneyIcon}
            label="Cash on delivery"
            sub={cod ? 'Buyers pay when the order arrives' : 'Off: buyers pay by QR'}
            value={cod}
            onChange={onCod}
          />
        </MeList>

        {identity ? (
          <MeList title="Account & safety">
            <MeRow first icon={IdentificationCardIcon} label="Verify identity" hint={identityHint} onPress={go('/seller/verification')} />
          </MeList>
        ) : null}

        <MeList title={pendingDeletion ? 'Shop deletion scheduled' : 'Danger zone'} last>
          {pendingDeletion ? (
            <View style={styles.pendingBody}>
              <Text style={styles.pendingText}>
                {'Your shop '}
                <Text style={styles.strong}>{store.name}</Text>
                {' is hidden from buyers and scheduled for permanent deletion on '}
                <Text style={styles.strong}>{deletionDate}</Text>
                {` (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining).`}
              </Text>
              <Text style={styles.pendingHint}>Cancel anytime before then to keep your shop and make it visible to buyers again.</Text>
              <SellerButton
                primary
                label="Cancel Deletion"
                Icon={ArrowCounterClockwiseIcon}
                onPress={() => setCancelConfirm(true)}
                style={styles.pendingBtn}
              />
            </View>
          ) : (
            <TwoLineRow
              first
              danger
              icon={TrashIcon}
              label="Delete shop"
              sub="Hidden from buyers at once, deleted after 15 days. You can cancel in that time."
              onPress={() => setDeleteConfirm(true)}
              end={<CaretRightIcon size={16} color={t.neutral[300]} />}
            />
          )}
        </MeList>
      </View>

      <OrderConfirmDialog
        open={deleteConfirm}
        title={`Delete "${store.name}"?`}
        message="Your shop will be hidden from buyers right away. It will be permanently deleted in 15 days unless you cancel before then."
        confirmLabel="Delete Shop"
        danger
        loading={isSubmitting}
        onConfirm={confirmRequestDeletion}
        onCancel={() => setDeleteConfirm(false)}
      />
      <OrderConfirmDialog
        open={cancelConfirm}
        title="Cancel shop deletion?"
        message="Your shop will immediately become active and visible to buyers again."
        confirmLabel="Cancel Deletion"
        loading={isSubmitting}
        onConfirm={confirmCancelDeletion}
        onCancel={() => setCancelConfirm(false)}
      />
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  // .sh-body: 12px between the sections (as on Me).
  body: { gap: 12 },
  strong: { ...font(700) },

  // .sst-row-text
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[800] },
  rowSub: { fontSize: 13, lineHeight: 18.2, ...font(400), color: t.neutral[500] },
  danger: { color: t.danger[600] },
  chevOpen: { transform: [{ rotate: '90deg' }] },

  // .sst-pending-line on phones: edge to edge.
  pendingLine: { marginHorizontal: -12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: t.warning[50] },
  pendingLinePressed: { backgroundColor: t.warning[100] },
  pendingLineText: { fontSize: 13.5, lineHeight: 20.3, ...font(400), color: t.warning[900] },
  pendingLineLink: { ...font(600), textDecorationLine: 'underline' },

  // .settings-deletion-body on phones
  pendingBody: { gap: 10, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 12 },
  pendingText: { fontSize: 14, lineHeight: 21.7, ...font(400), color: t.warning[900] },
  pendingHint: { fontSize: 12.5, lineHeight: 19.4, ...font(400), color: t.warning[800] },
  pendingBtn: { marginTop: 6 },
});
