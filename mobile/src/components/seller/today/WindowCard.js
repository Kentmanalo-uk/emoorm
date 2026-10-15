import { useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { DotsThreeIcon, ForkKnifeIcon, PlusIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { clockLabel, isOpen } from '../../../lib/availability';
import { dayTitle, manilaDay } from './todayTime';

/*
 * One Available Today post on Today's menu (web/src/pages/SellerToday.jsx
 * card(), SellerToday.css .stw-card at phone size): the photo, the name, one
 * status in plain words, one line of times and one of how many are left.
 * Then two buttons with words: Edit and Add more (Cancel before it opens),
 * with ⋯ for More time and Stop; Post again once it has ended.
 */

/** The first photo of a product's images (web lib/media firstImage). */
export const firstImage = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] || null : raw;
    } catch {
      return raw;
    }
  }
  return null;
};

const ms = (v) => new Date(v).getTime();

/** "Taking orders", "Sold out", "Not open yet", "Ended", "Cancelled" (web postStatus). */
export const postStatus = (w, ended = false, now = Date.now()) => {
  if (ended || !['LIVE', 'SCHEDULED'].includes(w.status)) {
    return { tone: 'ended', text: w.status === 'CANCELLED' ? 'Cancelled' : 'Ended' };
  }
  // Coming up is grouped by day and the card shows its times: the state alone.
  if (w.status === 'SCHEDULED' && ms(w.ordersOpenAt) > now) return { tone: 'soon', text: 'Not open yet' };
  if (!isOpen(w, now)) return { tone: 'ended', text: 'Ended' };
  if ((w.remaining ?? 1) <= 0) return { tone: 'out', text: 'Sold out' };
  return { tone: 'live', text: 'Taking orders' };
};

/** "Orders 10:00 AM – 2:00 PM" (web ordersSpan). */
export const ordersSpan = (w) => {
  const next = manilaDay(ms(w.ordersCloseAt)) !== manilaDay(ms(w.ordersOpenAt)) ? ' (next day)' : '';
  return `Orders ${clockLabel(w.ordersOpenAt)} – ${clockLabel(w.ordersCloseAt)}${next}`;
};

/** The product photo, or a plain tile when there is none or it fails to load. */
function Thumb({ src, dim }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <View style={[styles.thumb, styles.thumbEmpty]}><ForkKnifeIcon size={22} color={t.neutral[400]} /></View>;
  }
  return <Image source={{ uri: src }} style={[styles.thumb, dim && styles.dim]} resizeMode="cover" onError={() => setFailed(true)} />;
}

const STATUS_COLOR = {
  live: t.primary[700], soon: t.warning[700], out: t.danger[600], ended: t.neutral[600],
};

function Btn({
  label, onPress, disabled, main = false, danger = false, icon = null, square = false, accessibilityLabel,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, main && styles.btnMain, square && styles.btnSquare, (disabled || pressed) && styles.off]}
    >
      {icon}
      {label ? <Text style={[styles.btnText, main && styles.btnTextMain, danger && styles.btnTextDanger]} numberOfLines={1}>{label}</Text> : null}
    </Pressable>
  );
}

export default function WindowCard({
  window: w, ended = false, busy = false, today, onEdit, onAdd, onMore, onEnd, onRepeat, repeatOff = false,
}) {
  const state = postStatus(w, ended);
  const img = firstImage(w.product?.images);
  const live = w.status === 'LIVE';
  const left = w.remaining ?? Math.max(0, w.quantity - w.soldCount);
  const name = w.product?.name || 'Item';
  const dim = state.tone === 'ended' || state.tone === 'out';

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Thumb src={img ? resolveImg(img) : null} dim={dim} />
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={[styles.status, { color: STATUS_COLOR[state.tone] }]}>
            {ended ? `${dayTitle(manilaDay(ms(w.ordersOpenAt)), today)}${w.status === 'CANCELLED' ? ' · Cancelled' : ''}` : state.text}
          </Text>
          <Text style={styles.line}>
            {ordersSpan(w)}
          </Text>
          <Text style={styles.line}>
            <Text style={styles.strong}>{ended ? w.soldCount : left}</Text>
            {ended ? ` of ${w.quantity} ordered` : ` of ${w.quantity} left`}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {ended ? (
          <Btn label="Post again" disabled={busy || repeatOff} onPress={onRepeat} />
        ) : (
          <>
            <Btn label="Edit" disabled={busy} onPress={onEdit} />
            {live ? (
              <>
                <Btn main label="Add more" disabled={busy} onPress={onAdd} icon={<PlusIcon size={16} weight="bold" color="#fff" />} />
                <Btn
                  square
                  accessibilityLabel={`More for ${name}`}
                  disabled={busy}
                  onPress={onMore}
                  icon={<DotsThreeIcon size={22} weight="bold" color={t.neutral[600]} />}
                />
              </>
            ) : (
              <Btn danger label="Cancel" disabled={busy} onPress={onEnd} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // .stw-card
  card: {
    gap: 14, minWidth: 0, padding: 16, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 16, backgroundColor: t.neutral[0],
  },
  top: { flexDirection: 'row', gap: 14, minWidth: 0 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: t.neutral[100] },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, lineHeight: 22, ...font(600), color: t.neutral[900] },
  status: { marginTop: 2, marginBottom: 6, fontSize: 15, lineHeight: 20, ...font(600) },
  line: { fontSize: 15, lineHeight: 21.75, ...font(400), color: t.neutral[700] },
  strong: { ...font(600), color: t.neutral[900] },

  // .stw-actions, .stw-btn
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 46, paddingHorizontal: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  btnMain: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  btnSquare: {
    flexGrow: 0, flexShrink: 0, flexBasis: 46, width: 46, paddingHorizontal: 0,
  },
  off: { opacity: 0.6 },
  btnText: { fontSize: 15, lineHeight: 20, ...font(500), color: t.neutral[800] },
  btnTextMain: { color: '#fff' },
  btnTextDanger: { color: t.danger[600] },
});
