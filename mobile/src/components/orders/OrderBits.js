import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../theme';
import LoadingSkeleton from '../LoadingSkeleton';

/* Small pieces My Orders and Returns share (Orders.css phone rules). */

const TONES = {
  neutral: { bg: t.neutral[100], fg: t.neutral[600] },
  accent: { bg: t.success[50], fg: t.primary[700] },
  success: { bg: t.success[100], fg: t.primary[700] },
  warning: { bg: t.warning[50], fg: t.warning[700] },
  danger: { bg: t.danger[50], fg: t.danger[700] },
};

/** .order-status-badge: a pill in one of the muted tones. */
export function OrderBadge({ label, tone = 'neutral', style }) {
  const c = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * .order-action-btn: outlined (default), primary (green, 44 tall, 14px) or
 * danger (red outline). `Icon` is a Phosphor icon drawn at 16.
 */
export function OrderButton({
  label, Icon, onPress, primary = false, danger = false, disabled = false, busy = false, iconSize = 16, style, textStyle,
}) {
  const color = primary ? t.neutral[0] : danger ? t.danger[700] : t.neutral[700];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        danger && styles.btnDanger,
        pressed && !primary && styles.btnPressed,
        pressed && primary && styles.btnPrimaryPressed,
        (disabled || busy) && styles.btnOff,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size={14} color={color} /> : Icon ? <Icon size={iconSize} color={color} /> : null}
      <Text style={[styles.btnText, primary && styles.btnTextPrimary, { color }, textStyle]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/**
 * The card's button area (.order-card-actions on phones): a two-column grid,
 * primary actions first across the whole row, the others in pairs; an odd
 * one out takes the whole last row. `buttons`: [{ key, primary, ...props }].
 */
export function OrderActions({ buttons, style }) {
  const list = buttons.filter(Boolean);
  const primaries = list.filter((b) => b.primary);
  const rest = list.filter((b) => !b.primary);
  const rows = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
  return (
    <View style={[styles.actions, style]}>
      {primaries.map(({ key, ...b }) => <OrderButton key={key} {...b} />)}
      {rows.map((row) => (
        <View key={row.map((b) => b.key).join('|')} style={styles.actionRow}>
          {row.map(({ key, ...b }) => <OrderButton key={key} {...b} style={styles.half} />)}
        </View>
      ))}
    </View>
  );
}

/** .orders-tabs: one scrolling row of tabs with counts, an 8px band under it. */
export function OrderTabs({ tabs, active, onChange, counts = {} }) {
  return (
    <View style={styles.tabsWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const on = tab.key === active;
          const count = counts[tab.key] || 0;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(tab.key)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{tab.label}</Text>
              {count > 0 ? (
                <View style={[styles.count, on && styles.countOn]}>
                  <Text style={[styles.countText, on && styles.countTextOn]}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** OrderCardsSkeleton: grey chips, then cards with a shop line, an item and a total. */
export function OrderCardsSkeleton({ count = 3 }) {
  return (
    <View style={styles.sk}>
      <View style={styles.skChips}>
        {[0, 1, 2, 3].map((i) => <LoadingSkeleton key={i} height={32} width={78} borderRadius={999} />)}
      </View>
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={i} style={styles.skCard}>
          <View style={styles.skSpread}>
            <LoadingSkeleton height={13} width="45%" />
            <LoadingSkeleton height={20} width={80} borderRadius={999} />
          </View>
          <View style={[styles.skRow, { alignItems: 'flex-start' }]}>
            <LoadingSkeleton width={64} height={64} borderRadius={10} />
            <View style={styles.skLines}>
              <LoadingSkeleton height={13} width="80%" />
              <LoadingSkeleton height={11} width="30%" />
            </View>
          </View>
          <View style={styles.skSpread}>
            <LoadingSkeleton height={11} width={90} />
            <LoadingSkeleton height={15} width={80} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const cardShadow = {
  shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
};

const styles = StyleSheet.create({
  badge: { flexShrink: 0, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999 },
  badgeText: { fontSize: 11.5, lineHeight: 18.4, ...font(500) },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  btnPrimary: { minHeight: 44, borderColor: t.primary[600], backgroundColor: t.primary[600] },
  btnDanger: { borderColor: t.danger[200] },
  btnPressed: { backgroundColor: t.neutral[50], borderColor: t.neutral[400] },
  btnPrimaryPressed: { backgroundColor: t.primary[700], borderColor: t.primary[700] },
  btnOff: { opacity: 0.6 },
  btnText: { flexShrink: 1, fontSize: 13, lineHeight: 15.6, ...font(500) },
  btnTextPrimary: { fontSize: 14, lineHeight: 16.8 },

  actions: {
    gap: 8, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },

  tabsWrap: { marginHorizontal: -12, backgroundColor: t.neutral[0], borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  tabs: { gap: 2, paddingHorizontal: 6 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: t.primary[700] },
  tabText: { fontSize: 13.5, lineHeight: 16.2, ...font(500), color: t.neutral[500] },
  tabTextOn: { color: t.primary[700] },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  countOn: { backgroundColor: t.success[100] },
  countText: { fontSize: 12, lineHeight: 14.4, ...font(500), color: t.neutral[500] },
  countTextOn: { color: t.primary[700] },

  sk: { gap: 10 },
  skChips: { flexDirection: 'row', gap: 8, overflow: 'hidden' },
  skCard: { gap: 12, padding: 14, borderRadius: 14, backgroundColor: t.neutral[0] },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skSpread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  skLines: { flex: 1, minWidth: 0, gap: 7 },
});
