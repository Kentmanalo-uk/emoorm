import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PackageIcon, ProhibitIcon, WarningCircleIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';

/*
 * My products' "what needs doing" rows (web SellerProducts.jsx .spm-notices:
 * Home's .sh-notice rows from SellerApp.css, made edge to edge sections with
 * an 8px grey band under each by styles/phone-app.css): buyers can't order
 * yet, products to restock, suspended products.
 */
export default function ProductsNotices({ blockers, summary, status, onFinish, onSelect }) {
  const notReady = blockers.length > 0;
  const outOfStock = summary?.outOfStock || 0;
  const lowStock = summary?.lowStock || 0;
  const restockCount = outOfStock + lowStock;
  const suspendedCount = summary?.byStatus?.SUSPENDED || 0;
  const showRestock = restockCount > 0 && status !== 'restock';
  const showSuspended = suspendedCount > 0 && status !== 'SUSPENDED';
  if (!notReady && !showRestock && !showSuspended) return null;

  return (
    <View style={styles.list}>
      {notReady ? (
        <Notice
          tone="amber"
          Icon={WarningCircleIcon}
          title="Buyers can't order yet"
          text={`Finish: ${blockers.map((b) => b.label).join(', ')}`}
          cta="Finish"
          role="link"
          onPress={onFinish}
        />
      ) : null}
      {showRestock ? (
        <Notice
          tone={outOfStock > 0 ? 'red' : 'amber'}
          Icon={PackageIcon}
          title={restockCount === 1 ? '1 product needs restocking' : `${restockCount} products need restocking`}
          text={[outOfStock > 0 && `${outOfStock} out of stock`, lowStock > 0 && `${lowStock} running low`].filter(Boolean).join(' · ')}
          cta="View"
          onPress={() => onSelect('restock')}
        />
      ) : null}
      {showSuspended ? (
        <Notice
          tone="red"
          Icon={ProhibitIcon}
          title={suspendedCount === 1 ? '1 product was suspended' : `${suspendedCount} products were suspended`}
          text="Read the admin's note, then edit to send it back for review."
          cta="View"
          onPress={() => onSelect('SUSPENDED')}
        />
      ) : null}
    </View>
  );
}

function Notice({ tone, Icon, title, text, cta, role = 'button', onPress }) {
  const red = tone === 'red';
  return (
    <Pressable
      accessibilityRole={role}
      onPress={onPress}
      style={({ pressed }) => [styles.notice, pressed && styles.pressed]}
    >
      <View style={[styles.icon, red && styles.iconRed]}>
        <Icon size={22} weight="fill" color={red ? t.danger[600] : t.warning[600]} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {text ? <Text style={styles.sub}>{text}</Text> : null}
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>{cta}</Text>
      </View>
    </Pressable>
  );
}


const styles = themed(() => StyleSheet.create({
  // .spm-notices: 10px apart, 12px above the search panel.
  list: { gap: 10, marginBottom: 12 },
  // .sh-notice, edge to edge with the grey band under it.
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: -12,
    paddingVertical: 12, paddingHorizontal: 14, backgroundColor: t.neutral[0],
    borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  pressed: { backgroundColor: t.neutral[50] },
  icon: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.warning[50],
  },
  iconRed: { backgroundColor: t.danger[50] },
  text: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900], ...font(400) },
  sub: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  cta: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.primary[600] },
  ctaText: { fontSize: 13, lineHeight: 20.8, color: t.onBrand, ...font(500) },
}));
