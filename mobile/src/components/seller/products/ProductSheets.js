import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ArrowSquareOutIcon, EyeIcon, EyeSlashIcon, MinusIcon, PlusIcon, TrashIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import Sheet, { SheetButton, SheetOption } from '../../Sheet';
import { productKind } from '../productKinds';
import { PRODUCT_TABS, countFor, stockWords } from './productRules';

/*
 * My products' phone sheets (web SellerProducts.jsx PhoneSheet ×3):
 *   ProductsStatusSheet  "Show products": every status, with its count
 *   ProductMoreSheet     a product's other actions (hide/show, see it as a buyer, delete)
 *   ProductStockSheet    add stock with a big counter and quick amounts (.pm-stock)
 */

export function ProductsStatusSheet({ open, status, summary, onSelect, onClose }) {
  return (
    <Sheet variant="seller" open={open} title="Show products" onClose={onClose}>
      {PRODUCT_TABS.map((tab) => {
        const count = countFor(summary, tab.key);
        return (
          <SheetOption
            key={tab.key}
            variant="seller"
            selected={status === tab.key}
            label={(
              <>
                {tab.label}
                {count != null ? <Text style={styles.count}>{` ${count}`}</Text> : null}
              </>
            )}
            onPress={() => { onSelect(tab.key); onClose(); }}
          />
        );
      })}
    </Sheet>
  );
}

export function ProductMoreSheet({ product, busy, onToggleVisibility, onView, onDelete, onClose }) {
  const canToggle = product && (product.status === 'APPROVED' || product.status === 'HIDDEN');
  const hidden = product?.status === 'HIDDEN';
  return (
    <Sheet variant="seller" open={Boolean(product)} title={product?.name || 'Product'} onClose={onClose}>
      {canToggle ? (
        <SheetOption
          variant="seller"
          label={hidden ? 'Show to buyers again' : 'Hide from buyers'}
          right={hidden ? <EyeIcon size={18} color={t.neutral[800]} /> : <EyeSlashIcon size={18} color={t.neutral[800]} />}
          onPress={busy ? undefined : () => onToggleVisibility(product)}
        />
      ) : null}
      {product?.slug ? (
        <SheetOption
          variant="seller"
          label="See it as a buyer"
          right={<ArrowSquareOutIcon size={18} color={t.neutral[800]} />}
          onPress={() => onView(product)}
        />
      ) : null}
      <SheetOption
        variant="seller"
        danger
        label={productKind(product) === 'PACKAGE' ? 'Delete package' : 'Delete product'}
        right={<TrashIcon size={18} color={t.danger[600]} />}
        onPress={() => onDelete(product)}
      />
    </Sheet>
  );
}

export function ProductStockSheet({ product, amount, onChangeAmount, saving, onSave, onClose }) {
  const words = stockWords(product);
  const n = Number(amount) || 0;
  const label = saving
    ? 'Saving…'
    : words.unit && n > 0
      ? `Add ${n} ${words.unit(n)}`
      : `Add ${n > 0 ? n : ''} to stock`;
  return (
    <Sheet
      variant="seller"
      open={Boolean(product)}
      title={words.add}
      onClose={onClose}
      footer={<SheetButton variant="seller" primary label={label} disabled={saving || !(n > 0)} onPress={onSave} />}
    >
      {product ? (
        <View>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.now}>
            {words.now}: <Text style={styles.nowStrong}>{product.stock}</Text>
          </Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Less"
              onPress={() => onChangeAmount(Math.max(1, (Number(amount) || 1) - 1))}
              style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
            >
              <MinusIcon size={20} weight="bold" color={t.neutral[800]} />
            </Pressable>
            <TextInput
              value={amount === '' ? '' : String(amount)}
              onChangeText={(v) => onChangeAmount(v === '' ? '' : Math.max(0, parseInt(v, 10) || 0))}
              keyboardType="number-pad"
              selectTextOnFocus
              accessibilityLabel="How many to add"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => onChangeAmount((Number(amount) || 0) + 1)}
              style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
            >
              <PlusIcon size={20} weight="bold" color={t.neutral[800]} />
            </Pressable>
          </View>
          <View style={styles.quick}>
            {[5, 10, 20, 50].map((q) => (
              <Pressable key={q} accessibilityRole="button" onPress={() => onChangeAmount(q)} style={styles.quickChip}>
                <Text style={styles.quickText}>+{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  // .products-tab-count in a .scm-choice: grey, medium.
  count: { color: t.neutral[500], ...font(500), fontVariant: ['tabular-nums'] },

  name: { marginTop: 4, marginBottom: 2, fontSize: 16, lineHeight: 25.6, color: t.neutral[900], ...font(500) },
  now: { marginBottom: 16, fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
  nowStrong: { ...font(700) },
  stepper: { flexDirection: 'row', gap: 10 },
  step: {
    width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  stepPressed: { backgroundColor: t.neutral[200] },
  input: {
    flex: 1, minWidth: 0, height: 56, padding: 0, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 16,
    color: t.neutral[900], fontSize: 24, textAlign: 'center', ...font(600),
  },
  quick: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 4 },
  // .pm-quick .scm-chip
  quickChip: {
    flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
    borderRadius: 999, borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  quickText: { fontSize: 14, lineHeight: 20, color: t.neutral[700], ...font(400) },
}));
