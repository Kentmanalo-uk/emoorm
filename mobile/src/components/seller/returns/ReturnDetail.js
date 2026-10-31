import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  CheckCircleIcon, CheckIcon, PackageIcon, TruckIcon, WalletIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import FieldSelect from '../today/FieldSelect';
import { StatusPill, elevCard } from './ReturnBits';

/*
 * The chosen return request (web/src/pages/SellerReturns.jsx
 * .seller-return-detail; SellerReturns.css at phone size, where it sits above
 * the list): who asked and why, the items, the buyer's note and any dispute,
 * then what the seller can do at this stage: approve or reject (amount,
 * physical return, note), mark the parcel received, or record the refund.
 */

const METHODS = [
  { value: 'GCASH', label: 'GCash' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'COD_CASH', label: 'Cash' },
  { value: 'MANUAL', label: 'Manual' },
];

/** A labelled form field (.seller-action-form > label). */
function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const amountText = (v) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

export default function ReturnDetail({
  selected, amount, setAmount, note, setNote, method, setMethod, reference, setReference, physical, setPhysical,
  busy, onDecide, onReceived, onRefund,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.topMain}>
          <Text style={styles.kicker}>{selected.requestNumber}</Text>
          <Text style={styles.title} accessibilityRole="header">{selected.buyer?.fullName || 'Buyer'}’s request</Text>
          <Text style={styles.sub}>Order #{selected.order?.orderNumber} · {selected.reason}</Text>
        </View>
        <StatusPill status={selected.status} />
      </View>

      <View style={styles.items}>
        {(selected.items || []).map((line) => (
          <View key={line.id} style={styles.item}>
            <View style={styles.itemIcon}><PackageIcon size={19} color={t.secondary[950]} /></View>
            <Text style={styles.itemName}>{line.orderItem?.product?.name || line.orderItem?.productName}</Text>
            <Text style={styles.itemQty}>×{line.quantity}</Text>
          </View>
        ))}
      </View>

      {selected.buyerNote ? <Text style={styles.note}>“{selected.buyerNote}”</Text> : null}
      {selected.disputeReason ? <Text style={styles.note}><Text style={styles.noteBold}>Disputed:</Text> “{selected.disputeReason}”</Text> : null}
      {selected.disputeResolution ? <Text style={styles.note}><Text style={styles.noteBold}>Admin decision:</Text> {selected.disputeResolution}</Text> : null}

      {selected.status === 'REQUESTED' ? (
        <View style={styles.form}>
          <Field label="Approved amount">
            <TextInput value={amount} onChangeText={(v) => setAmount(amountText(v))} keyboardType="decimal-pad" style={styles.input} accessibilityLabel="Approved amount" />
          </Field>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: physical }} onPress={() => setPhysical(!physical)} style={styles.check}>
            <View style={[styles.box, physical && styles.boxOn]}>
              {physical ? <CheckIcon size={14} weight="bold" color="#fff" /> : null}
            </View>
            <Text style={styles.checkText}>Requires physical return</Text>
          </Pressable>
          <Field label="Note">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for the buyer"
              placeholderTextColor={t.neutral[400]}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
              accessibilityLabel="Note"
            />
          </Field>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => onDecide('REJECT')} style={[styles.btn, styles.reject, busy && styles.off]}>
              <Text style={[styles.btnText, styles.rejectText]}>Reject</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => onDecide('APPROVE')} style={[styles.btn, styles.approve, busy && styles.off]}>
              <CheckCircleIcon size={17} color="#fff" />
              <Text style={[styles.btnText, styles.approveText]}>Approve</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {selected.status === 'AWAITING_SHIPMENT' ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={onReceived} style={[styles.btn, styles.approve, styles.wide, busy && styles.off]}>
          <TruckIcon size={19} color="#fff" />
          <Text style={[styles.btnText, styles.approveText]}>Mark items received</Text>
        </Pressable>
      ) : null}

      {['APPROVED', 'RECEIVED'].includes(selected.status) ? (
        <View style={styles.form}>
          <Field label="Refund method">
            <FieldSelect value={method} options={METHODS} onChange={setMethod} style={styles.select} accessibilityLabel="Refund method" />
          </Field>
          <Field label="Refund amount">
            <TextInput value={amount} onChangeText={(v) => setAmount(amountText(v))} keyboardType="decimal-pad" style={styles.input} accessibilityLabel="Refund amount" />
          </Field>
          <Field label="Reference">
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder="Transaction reference"
              placeholderTextColor={t.neutral[400]}
              autoCapitalize="none"
              style={styles.input}
              accessibilityLabel="Reference"
            />
          </Field>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onRefund} style={[styles.btn, styles.approve, styles.wide, busy && styles.off]}>
            <WalletIcon size={19} color="#fff" />
            <Text style={[styles.btnText, styles.approveText]}>Record refund</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: t.neutral[0], ...elevCard },

  // .seller-detail-top (a column on phones)
  top: { alignItems: 'flex-start', gap: 8 },
  topMain: { minWidth: 0, alignSelf: 'stretch' },
  kicker: { fontSize: 11, lineHeight: 16, ...font(700), letterSpacing: 0.66, textTransform: 'uppercase', color: t.primary[600] },
  title: { marginVertical: 4, fontSize: 18, lineHeight: 23.4, ...font(600), color: t.secondary[950] },
  sub: { fontSize: 13, lineHeight: 19, ...font(400), color: t.neutral[500] },

  // .seller-detail-items
  items: {
    marginVertical: 14, paddingVertical: 4, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: t.neutral[150],
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  itemIcon: { width: 22 },
  itemName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, ...font(400), color: t.secondary[950] },
  itemQty: { fontSize: 14, lineHeight: 20, ...font(700), color: t.secondary[950] },

  // .buyer-note
  note: {
    marginBottom: 14, padding: 12, borderRadius: 10, backgroundColor: t.neutral[50],
    fontSize: 13, lineHeight: 19, ...font(400), color: t.neutral[600],
  },
  noteBold: { ...font(700) },

  // .seller-action-form
  form: { gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 18, ...font(700), color: t.neutral[700] },
  input: {
    minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10,
    backgroundColor: t.neutral[0], fontSize: 16, ...font(400), color: t.neutral[900],
  },
  textarea: { minHeight: 96 },
  select: { borderColor: t.neutral[300], borderRadius: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: t.neutral[400],
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0],
  },
  boxOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  checkText: { fontSize: 13, lineHeight: 18, ...font(500), color: t.secondary[950] },

  // .seller-actions, .seller-approve, .seller-wide-action
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 46, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
  },
  reject: { borderWidth: 1, borderColor: t.danger[300], backgroundColor: t.neutral[0] },
  approve: { backgroundColor: t.primary[600] },
  wide: { flex: 0, alignSelf: 'stretch', gap: 7, paddingVertical: 11, paddingHorizontal: 15 },
  off: { opacity: 0.6 },
  btnText: { fontSize: 15, lineHeight: 20, ...font(700) },
  rejectText: { color: t.danger[700] },
  approveText: { color: t.onBrand },
}));
