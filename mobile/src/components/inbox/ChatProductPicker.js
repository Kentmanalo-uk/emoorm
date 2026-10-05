import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MagnifyingGlassIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { font, t } from '../../theme';
import ChatProductThumb from './ChatProductThumb';
import InboxSheet from './InboxSheet';
import InboxSpinner from './InboxSpinner';
import { firstImageOf, formatMoney } from './inboxFormat';

/**
 * "Attach a product": the shop's products in a bottom sheet, to send with
 * the next message (web Messenger.jsx ProductPicker, .msgr-sheet).
 * onPick({ id, name, price, image, slug }).
 */
export default function ChatProductPicker({ open, storeId, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Each opening starts afresh, as the website mounts a new sheet.
  useEffect(() => {
    if (open) { setQuery(''); setLoading(true); }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get('/products', {
          params: { storeId, pageSize: 30, ...(query.trim() ? { search: query.trim() } : {}) },
        });
        if (live) setItems(res.data || []);
      } catch {
        if (live) setItems([]);
      } finally {
        if (live) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [open, storeId, query]);

  return (
    <InboxSheet open={open} onClose={onClose} label="Attach a product" style={styles.sheet}>
      {(bottom) => (
        <View style={[styles.inner, { paddingBottom: 12 + bottom }]}>
          <View style={styles.head}>
            <View style={styles.grabber} />
            <Text style={styles.title} accessibilityRole="header">Attach a product</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <XIcon size={18} weight="bold" color={t.neutral[700]} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <MagnifyingGlassIcon size={16} color={t.neutral[500]} />
            <TextInput
              value={query}
              onChangeText={(v) => { setLoading(true); setQuery(v); }}
              placeholder="Search this shop's products"
              placeholderTextColor={t.neutral[400]}
              accessibilityLabel="Search products"
              returnKeyType="search"
              style={styles.searchInput}
              underlineColorAndroid="transparent"
            />
          </View>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.empty}>
                <InboxSpinner size={18} color={t.neutral[500]} />
                <Text style={styles.emptyText}>Loading products…</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{query ? `No products match “${query}”.` : 'This shop has no products yet.'}</Text>
              </View>
            ) : items.map((p) => {
              const img = firstImageOf(p);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  onPress={() => onPick({ id: p.id, name: p.name, price: Number(p.price), image: img, slug: p.slug })}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                >
                  <View style={styles.itemImg}><ChatProductThumb src={img} style={styles.fill} /></View>
                  <View style={styles.itemText}>
                    <Text style={styles.itemName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.itemPrice}>{formatMoney(p.price)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </InboxSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxWidth: 520, alignSelf: 'center' },
  inner: { paddingTop: 8, paddingHorizontal: 16, flexShrink: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 8 },
  grabber: { position: 'absolute', top: 2, left: '50%', marginLeft: -20, width: 40, height: 5, borderRadius: 999, backgroundColor: t.neutral[200] },
  title: { fontSize: 17, lineHeight: 19.55, color: t.neutral[900], ...font(500) },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginBottom: 8, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: t.neutral[100],
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', padding: 0, fontSize: 16, color: t.neutral[900], ...font(400), outlineStyle: 'none' },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 120 },
  empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { fontSize: 14, lineHeight: 20, color: t.neutral[500], ...font(400) },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  itemPressed: { backgroundColor: t.neutral[50] },
  itemImg: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  fill: { width: '100%', height: '100%' },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 14.5, lineHeight: 17.4, color: t.neutral[900], ...font(400) },
  itemPrice: { fontSize: 13.5, lineHeight: 16.2, color: t.primary[700], ...font(500) },
});
