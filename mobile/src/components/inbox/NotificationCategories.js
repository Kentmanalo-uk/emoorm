import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BellRingingIcon, ChatCircleDotsIcon, ClipboardTextIcon, MegaphoneIcon,
} from '../../lib/icons';
import GradientIcon from '../GradientIcon';
import { font, ink, t, themed } from '../../theme';

/*
 * The notifications' groups, in one bar above the list (shopping apps'
 * Chats · Orders · Alerts · Promos): a colour icon and a name each, thin
 * rules between, a count when a group has unread ones. Tapping a group shows
 * only it; tapping it again shows them all. The server knows which type is in
 * which group (GET /notifications?category=…, backend utils/notificationCategories).
 *
 *   <NotificationCategories value={category} onChange={setCategory} unread={unreadByCategory} />
 */

export const NOTIFICATION_CATEGORIES = [
  { key: 'chats', label: 'Chats', Icon: ChatCircleDotsIcon, colors: ['#86efac', '#16a34a'] },
  { key: 'orders', label: 'Orders', Icon: ClipboardTextIcon, colors: ['#a5b4fc', '#4f46e5'] },
  { key: 'alerts', label: 'Alerts', Icon: BellRingingIcon, colors: ['#fde68a', '#f59e0b'] },
  { key: 'promos', label: 'Promos', Icon: MegaphoneIcon, colors: ['#f5d0fe', '#c026d3'] },
];

// The types each group holds (as the server's list), so a notice marked read
// here takes one off its own group's count. Any other type is an alert.
const GROUP_TYPES = {
  chats: ['STORE_MESSAGE', 'SUPPORT_MESSAGE', 'SUPPORT_RESOLVED', 'ADMIN_MESSAGE', 'PRODUCT_QUESTION', 'PRODUCT_ANSWER', 'PRICE_OFFER'],
  orders: [
    'ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED',
    'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED',
    'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED', 'RETURN_DISPUTED', 'RETURN_DISPUTE_RESOLVED',
  ],
  promos: ['STORE_PROMOTION', 'PRICE_DROP', 'STORE_NEW_PRODUCT', 'STORE_ANNOUNCEMENT'],
};

export const categoryOfType = (type) => Object.keys(GROUP_TYPES).find((key) => GROUP_TYPES[key].includes(type)) || 'alerts';

/** The counts after one notice of `type` was read. */
export const minusOne = (counts, type) => {
  const key = categoryOfType(type);
  return { ...counts, [key]: Math.max(0, (counts[key] || 0) - 1) };
};

export default function NotificationCategories({ value, onChange, unread = {} }) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {NOTIFICATION_CATEGORIES.map((c, i) => {
        const on = value === c.key;
        const count = unread[c.key] || 0;
        return (
          <View key={c.key} style={styles.cell}>
            {i > 0 ? <View style={styles.rule} /> : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c.label}${count ? `, ${count} unread` : ''}`}
              onPress={() => onChange(on ? null : c.key)}
              style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && styles.itemPressed]}
            >
              <View>
                <GradientIcon Icon={c.Icon} colors={c.colors} size={20} />
                {count ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>
                ) : null}
              </View>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{c.label}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingVertical: 4, paddingHorizontal: 4,
    borderRadius: 14, backgroundColor: t.neutral[50],
  },
  cell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  rule: { width: 1, height: 22, backgroundColor: t.neutral[200] },
  item: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 42, marginHorizontal: 2, paddingHorizontal: 2, borderRadius: 10,
  },
  itemOn: { backgroundColor: t.neutral[0], boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: ink(0.08) }] },
  itemPressed: { backgroundColor: t.neutral[100] },
  label: { flexShrink: 1, fontSize: 13.5, lineHeight: 18, ...font(500), color: t.neutral[800] },
  labelOn: { color: t.primary[700], ...font(600) },
  badge: {
    position: 'absolute', top: -6, right: -7, minWidth: 15, height: 15, paddingHorizontal: 3.5, borderRadius: 7.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.danger[500], borderWidth: 1.5, borderColor: t.neutral[50],
  },
  badgeText: { fontSize: 9, lineHeight: 11, ...font(600), color: t.onBrand },
}));
