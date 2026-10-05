import { useCallback, useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircleIcon, ClockIcon, PackageIcon, ScalesIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import ScreenHeader from '../../src/components/ScreenHeader';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';
import { cardShadow } from '../../src/components/orders/OrderBits';
import { fullStamp } from '../../src/components/orders/orderProgress';
import {
  RETURN_LABELS, ReturnStatusPill, ReturnsMessage, ReturnsPrimary, returnAmount, returnsText,
} from '../../src/components/returns/ReturnBits';

/*
 * One return request (web/src/pages/ReturnDetail.jsx at phone size): its
 * number and status, the progress, the items and amount, the seller's note,
 * the dispute (a rejection can go to the municipal admin within a week) and
 * Cancel request / Close return.
 */

// A rejection can be taken to the municipal admin within a week of it.
const DISPUTE_DAYS = 7;

export default function ReturnDetail() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  // When it was loaded: the dispute window is checked against this.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(() => apiClient.get(`/returns/${id}`)
    .then((res) => { setItem(res.data); setLoadedAt(Date.now()); setFailed(false); })
    .catch(() => setFailed(true)), [id]);
  useEffect(() => { load(); }, [load]);

  const action = async (path, message, body) => {
    setBusy(true);
    try {
      await apiClient.post(`/returns/${id}/${path}`, body);
      toast.success(message);
      await load();
      return true;
    } catch (err) {
      toast.error(err.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // The website's bar takes its title from the page's heading, which is
  // only there once the request has loaded.
  const header = <ScreenHeader title={item ? 'Return request' : undefined} backTo="/returns" />;

  if (!item) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.content}>
          {failed ? (
            <ReturnsMessage>
              <Text style={[returnsText.message, styles.messageP]}>{'This return request couldn’t be loaded.'}</Text>
              <ReturnsPrimary label="Try again" onPress={() => { setFailed(false); load(); }} style={styles.wide} />
            </ReturnsMessage>
          ) : (
            <ReturnsMessage><Text style={returnsText.message}>Loading return request…</Text></ReturnsMessage>
          )}
        </View>
      </View>
    );
  }

  const canDispute = item.status === 'REJECTED' && !item.disputedAt && item.decidedAt
    && loadedAt - new Date(item.decidedAt).getTime() < DISPUTE_DAYS * 86400e3;

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.eyebrow}>{(item.requestNumber || '').toUpperCase()}</Text>
            <Text style={styles.orderNo}>Order #{item.order?.orderNumber}</Text>
          </View>
          <ReturnStatusPill status={item.status} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.h2}>Progress</Text>
          <View style={styles.timeline}>
            {(item.history || []).map((event, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <View key={`${event.at}-${index}`} style={styles.timelineRow}>
                <CheckCircleIcon size={17} color={t.secondary[700]} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineTitle}>{RETURN_LABELS[event.status] || event.event || event.status}</Text>
                  <Text style={styles.timelineWhen}>{event.at ? fullStamp(event.at) : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.h2}>Items</Text>
          {item.items?.map((line) => (
            <View key={line.id} style={styles.detailItem}>
              <View style={styles.detailIcon}><PackageIcon size={20} color={t.secondary[950]} /></View>
              <View style={styles.detailText}>
                <Text style={styles.body}>{line.orderItem?.product?.name || line.orderItem?.productName}</Text>
                <Text style={styles.detailQty}>Qty {line.quantity}</Text>
              </View>
              <Text style={[styles.body, styles.strong]}>₱{Number(line.subtotal).toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.detailTotal}>
            <Text style={styles.body}>{item.status === 'REFUNDED' ? 'Refunded amount' : 'Requested amount'}</Text>
            <Text style={[styles.body, styles.strong]}>₱{returnAmount(item).toFixed(2)}</Text>
          </View>
        </View>

        {item.sellerNote ? <ReturnNote title="Seller note" text={item.sellerNote} /> : null}
        {item.disputeReason ? <ReturnNote title="Why you disputed it" text={item.disputeReason} /> : null}
        {item.disputeResolution ? <ReturnNote title={'The admin’s decision'} text={item.disputeResolution} decision /> : null}

        {canDispute ? (
          <View style={styles.panel}>
            <View style={styles.disputeHead}>
              <ScalesIcon size={18} color={t.neutral[900]} />
              <Text style={[styles.h2, styles.h2Inline]}>Think the rejection is wrong?</Text>
            </View>
            {!disputing ? (
              <>
                <Text style={styles.disputeText}>
                  {`The municipal admin of the shop’s town can look at your photos and the shop’s reason, and decide. You can ask within ${DISPUTE_DAYS} days of the rejection.`}
                </Text>
                <ReturnsPrimary label="Ask the admin to decide" onPress={() => setDisputing(true)} />
              </>
            ) : (
              <>
                <TextInput
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={'What is wrong with the shop\'s reason? e.g. The photos show the jar arrived cracked.'}
                  placeholderTextColor="#757575"
                  style={styles.disputeInput}
                  textAlignVertical="top"
                />
                <View style={styles.disputeActions}>
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDisputing(false)} style={styles.plainBtn}>
                    <Text style={styles.plainBtnText}>Cancel</Text>
                  </Pressable>
                  <ReturnsPrimary
                    label="Send to the admin"
                    disabled={busy || reason.trim().length < 10}
                    onPress={async () => { if (await action('dispute', 'Sent to the municipal admin', { reason })) setDisputing(false); }}
                    style={styles.sendBtn}
                  />
                </View>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.actions}>
          {item.status === 'REQUESTED' ? (
            <ActionButton label="Cancel request" disabled={busy} onPress={() => action('cancel', 'Return request cancelled')} />
          ) : null}
          {/* On the website the red-outline rule outranks .returns-primary here,
              so Close return looks like Cancel request. */}
          {item.status === 'REFUNDED' ? (
            <ActionButton label="Close return" disabled={busy} onPress={() => action('close', 'Return closed')} />
          ) : null}
          {item.status === 'AWAITING_SHIPMENT' ? (
            <ReturnHint Icon={ClockIcon} text="Ship the items back and wait for the seller to confirm receipt." />
          ) : null}
          {item.status === 'DISPUTED' ? (
            <ReturnHint Icon={ScalesIcon} text={'The municipal admin is looking at this. You’ll be notified of the decision.'} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function ReturnNote({ title, text, decision = false }) {
  return (
    <View style={[styles.note, decision && styles.noteDecision]}>
      <Text style={[styles.body, styles.strong]}>{title}</Text>
      <Text style={[styles.body, styles.noteText]}>{text}</Text>
    </View>
  );
}

function ActionButton({ label, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && !disabled && styles.actionBtnPressed]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/**
 * .return-hint: an icon and a line on a pale blue band. On the website the
 * 18px icon is a flex item that gives way to the long line (it comes out
 * 13-16px wide), so here its box shrinks the same way and the icon fits it.
 */
function ReturnHint({ Icon, text }) {
  const [box, setBox] = useState(18);
  return (
    <View style={styles.hint}>
      <View style={styles.hintIcon} onLayout={(e) => setBox(Math.min(18, e.nativeEvent.layout.width))}>
        <Icon size={box} color={t.info[800]} />
      </View>
      <Text style={styles.hintText}>{text}</Text>
    </View>
  );
}

const panelBase = {
  marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: t.neutral[0], ...cardShadow,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { paddingTop: 12, paddingHorizontal: 12 },
  wide: { alignSelf: 'stretch' },
  // A <p>: the website's paragraphs keep 14px under them.
  messageP: { marginBottom: 14 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  eyebrow: { marginBottom: 4, fontSize: 11, lineHeight: 17.6, letterSpacing: 1.21, ...font(500), color: t.secondary[600] },
  // An inline 13px line inside the block's 24px lines.
  orderNo: { fontSize: 13, lineHeight: 24, ...font(400), color: t.neutral[500] },

  panel: panelBase,
  h2: { marginBottom: 12, fontSize: 16, lineHeight: 18.4, ...font(500), color: t.neutral[900] },
  h2Inline: { marginBottom: 0, flexShrink: 1 },

  timeline: { gap: 17 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  timelineText: { flex: 1, minWidth: 0 },
  timelineTitle: { fontSize: 15, lineHeight: 24, ...font(500), color: t.secondary[950] },
  timelineWhen: { marginTop: 3, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },

  body: { fontSize: 15, lineHeight: 24, ...font(400), color: t.secondary[950] },
  strong: { ...font(500) },
  detailItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: t.neutral[150],
  },
  detailIcon: { width: 22, height: 24, justifyContent: 'center' },
  detailText: { flex: 1, minWidth: 0 },
  detailQty: { marginTop: 4, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  detailTotal: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 12 },

  note: { ...panelBase, backgroundColor: t.neutral[50] },
  noteDecision: { backgroundColor: t.info[50] },
  noteText: { color: t.neutral[600] },

  disputeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  disputeText: { marginBottom: 14, fontSize: 14, lineHeight: 21.7, ...font(400), color: t.neutral[600] },
  disputeInput: {
    minHeight: 111.6, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    fontSize: 14, lineHeight: 22.4, ...font(400), color: '#000', backgroundColor: t.neutral[0],
    // An inline-block on the website: the line's descent adds 7px under it.
    marginBottom: 7,
  },
  disputeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  plainBtn: { justifyContent: 'center' },
  plainBtnText: { fontSize: 14, lineHeight: 16.8, ...font(400), color: '#000' },
  sendBtn: { flexGrow: 1, flexShrink: 1 },

  actions: { marginTop: 12, gap: 8 },
  actionBtn: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.danger[300], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  actionBtnPressed: { backgroundColor: t.danger[50] },
  actionText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: t.danger[700] },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 10, backgroundColor: t.info[50],
  },
  hintIcon: { width: 18, height: 18, flexShrink: 1, alignItems: 'center', justifyContent: 'center' },
  hintText: { flexShrink: 1, fontSize: 13, lineHeight: 18.85, ...font(400), color: t.info[800] },
});
