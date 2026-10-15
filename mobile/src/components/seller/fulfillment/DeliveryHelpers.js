import { useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import apiClient from '../../../api/client';
import { resolveImg } from '../../../lib/media';
import { toast } from '../../../lib/toast';
import { font, t } from '../../../theme';
import { Hint } from './FulfillmentParts';

/*
 * The Delivery part's helpers (web/src/pages/SellerFulfillment.jsx):
 * WeightFixer (products a courier can't price until they have a weight).
 * The places and fees are DeliveryPlaces.
 */

/**
 * Products without a weight, each with a kilogram box: a courier can't
 * price them, so couriers wait until every product has one.
 */
export function WeightFixer({ products, total, onSaved }) {
  const [kg, setKg] = useState({});
  const [busy, setBusy] = useState(false);
  const filled = products.filter((p) => Number(kg[p.id]) > 0 && Number(kg[p.id]) <= 100);

  const save = async () => {
    if (!filled.length || busy) return;
    setBusy(true);
    let saved = 0;
    for (const p of filled) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await apiClient.put(`/products/${p.id}`, { weightGrams: Math.round(Number(kg[p.id]) * 1000) });
        saved += 1;
      } catch (err) {
        toast.error(`${p.name}: ${err.message || 'could not save'}`);
      }
    }
    setBusy(false);
    if (saved) {
      toast.success(`Saved ${saved} weight${saved === 1 ? '' : 's'}`);
      setKg({});
      onSaved?.();
    }
  };

  return (
    <View style={styles.weigh} accessibilityLabel="Products that need a weight">
      <View style={styles.weighHead}>
        <Text style={styles.weighTitle}>Add a weight to {total === 1 ? 'your product' : `your ${total} products`} to ship with couriers.</Text>
        <Text style={styles.weighSub}>Couriers charge by weight with the packaging, so the fee is worked out for each order.</Text>
      </View>
      <View style={styles.weighList}>
        {products.map((p) => (
          <View key={p.id} style={styles.weighRow}>
            {p.image ? <Image source={{ uri: resolveImg(p.image) }} style={styles.weighImg} /> : <View style={styles.weighImg} />}
            <Text style={styles.weighName} numberOfLines={1}>{p.name}</Text>
            <View style={styles.weighInputWrap}>
              <TextInput
                value={kg[p.id] ?? ''}
                onChangeText={(v) => setKg((prev) => ({ ...prev, [p.id]: v }))}
                placeholder="0.5"
                placeholderTextColor={t.neutral[400]}
                keyboardType="decimal-pad"
                accessibilityLabel={`Weight of ${p.name} in kilograms`}
                style={styles.weighInput}
              />
              <Text style={styles.weighKg}>kg</Text>
            </View>
          </View>
        ))}
      </View>
      {total > products.length ? <Hint style={styles.weighMore}>Showing {products.length} of {total}. Save these to see the rest.</Hint> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !filled.length || busy }}
        disabled={!filled.length || busy}
        onPress={save}
        style={[styles.weighSave, (!filled.length || busy) && styles.weighSaveOff]}
      >
        <Text style={styles.weighSaveText}>
          {busy ? 'Saving…' : filled.length ? `Save ${filled.length} weight${filled.length === 1 ? '' : 's'}` : 'Save weights'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  weigh: {
    marginTop: 12, padding: 14, borderWidth: 1, borderColor: t.warning[200], borderRadius: 14, backgroundColor: t.warning[50],
  },
  weighHead: { gap: 2, marginBottom: 10 },
  weighTitle: { fontSize: 14, lineHeight: 20, color: t.warning[800], ...font(600) },
  weighSub: { fontSize: 12.5, lineHeight: 18, color: '#a16207', ...font(400) },
  weighList: { gap: 6 },
  weighRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#fff',
  },
  weighImg: { width: 36, height: 36, borderRadius: 8, backgroundColor: t.neutral[100] },
  weighName: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 20, color: t.neutral[900], ...font(500) },
  weighInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  weighInput: {
    width: 84, height: 36, paddingVertical: 0, paddingHorizontal: 8, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    backgroundColor: '#fff', fontSize: 14, color: t.neutral[900], ...font(400),
  },
  weighKg: { fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(600) },
  weighMore: { marginTop: 8 },
  weighSave: {
    alignSelf: 'flex-start', marginTop: 10, height: 40, paddingHorizontal: 16, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  weighSaveOff: { opacity: 0.5 },
  weighSaveText: { fontSize: 14, lineHeight: 18, color: '#fff', ...font(600) },
});
