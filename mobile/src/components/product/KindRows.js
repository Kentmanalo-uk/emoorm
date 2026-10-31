import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon } from '../../lib/icons';
import ProductImage from '../ProductImage';
import { font, t, themed } from '../../theme';
import { parseImages } from './productLib';
import {
  PACKAGE_KINDS, ageLabel, animalLabel, cookDaysLabel, minOrder, prepLabel, productKind, sexLabel, weightLabel,
} from './productKinds';
import { aheadLabel, clockLabel, servesText } from './kindBuying';

/*
 * The product page's rows for a product's kind, before the delivery rows
 * (web/src/components/product/kinds/KindRows.jsx at phone size): a paluto's
 * serving, minimum order, preparation and cooking days; a live animal's
 * facts; a package's items and how far ahead to order. Nothing for regular
 * goods and ready-to-eat food.
 *
 * Row is the page's own row (label above, content below), so the kind's rows
 * read as the rest; every row after the page's first gets its faint top line.
 */

/** "Age: 8 months old" and the like; seller notes in plain words. */
function Fact({ Row, label, note = false, top, children }) {
  return (
    <Row label={label} top={top}>
      <Text style={[styles.fact, note && styles.note]}>{children}</Text>
    </Row>
  );
}

/** One row per fact that has a value. */
const factRows = (Row, facts, first) => facts
  .filter(([, value]) => value)
  .map(([label, value], i) => <Fact key={label} Row={Row} label={`${label}:`} top={!(first && i === 0)}>{value}</Fact>);

/**
 * What a package holds: each item's photo, how many and its name, opening
 * the item's own page while the shop still sells it on its own.
 */
function PackageItems({ Row, product, made, ahead, top }) {
  const router = useRouter();
  const items = Array.isArray(product.packageItems) ? product.packageItems : [];
  if (!items.length) return null;
  const sum = [made && `${made} package`, `${items.length} ${items.length === 1 ? 'product' : 'products'}`, ahead && `Order ${ahead} ahead`]
    .filter(Boolean).join(' · ');
  return (
    <Row label="What's included:" top={top}>
      <Text style={styles.pkgSum}>{sum}</Text>
      <View style={styles.pkgList}>
        {items.map((it, i) => {
          const item = it.product || {};
          const onSale = Boolean(item.slug) && !item.deletedAt && item.status === 'APPROVED';
          const body = (
            <>
              <View style={styles.pkgImg}><ProductImage src={parseImages(item.images)[0]} /></View>
              <Text style={styles.pkgQty}>{it.quantity}×</Text>
              <Text style={styles.pkgName}>{item.name || 'Item'}</Text>
            </>
          );
          return onSale ? (
            <Pressable
              key={it.productId || i}
              accessibilityRole="link"
              onPress={() => router.push(`/product/${item.slug}`)}
              style={({ pressed }) => [styles.pkgItem, i > 0 && styles.pkgLine, pressed && styles.pkgPressed]}
            >
              {body}
              <CaretRightIcon size={14} color={t.neutral[400]} style={styles.pkgCaret} />
            </Pressable>
          ) : (
            <View key={it.productId || i} style={[styles.pkgItem, i > 0 && styles.pkgLine]}>{body}</View>
          );
        })}
      </View>
    </Row>
  );
}

/** @param {boolean} [first] - these are the page's first rows (no line on top of the first one) */
export default function KindRows({ product, Row, first = true }) {
  const kind = productKind(product);
  const d = product?.details || {};

  if (kind === 'COOK_TO_ORDER') {
    const least = minOrder(product);
    const orderBy = clockLabel(d.orderBy);
    const rows = factRows(Row, [
      ['Good for', d.serves && servesText(d.serves)],
      ['Minimum order', least > 1 && least],
      ['Ready in', prepLabel(d) && `${prepLabel(d)} after the shop confirms your order`],
      ['Cooking days', `${cookDaysLabel(d)}${orderBy ? `, order by ${orderBy}` : ''}`],
    ], first);
    return (
      <>
        {rows}
        {d.notes ? <Fact Row={Row} label="Seller notes:" note top={!(first && !rows.length)}>{d.notes}</Fact> : null}
      </>
    );
  }

  if (kind === 'LIVESTOCK') {
    const heads = Math.max(0, Number(product.stock) || 0);
    const rows = factRows(Row, [
      ['Animal', animalLabel(d)],
      ['Age', ageLabel(d)],
      ['Sex', sexLabel(d)],
      ['Weight', weightLabel(d)],
      ['Heads available', heads || 'Sold out'],
      ['Farm visit', d.visitFirst && 'You can visit the farm first. Message the shop to set a day.'],
    ], first);
    return (
      <>
        {rows}
        {d.notes ? <Fact Row={Row} label="Seller notes:" note top={!(first && !rows.length)}>{d.notes}</Fact> : null}
      </>
    );
  }

  if (kind === 'PACKAGE') {
    const notice = Number(d.noticeHours) || 0;
    const made = d.packageKind !== 'OTHER' && PACKAGE_KINDS.find((k) => k.key === d.packageKind)?.label;
    return <PackageItems Row={Row} product={product} made={made} ahead={notice > 0 ? aheadLabel(notice) : ''} top={!first} />;
  }

  return null;
}

/** Whether KindRows draws anything for this product (so the next row knows if it is the first). */
export const hasKindRows = (product) => {
  const kind = productKind(product);
  if (kind === 'COOK_TO_ORDER' || kind === 'LIVESTOCK') return true;
  return kind === 'PACKAGE' && Array.isArray(product?.packageItems) && product.packageItems.length > 0;
};

const styles = themed(() => StyleSheet.create({
  fact: { fontSize: 14, lineHeight: 21, ...font(500), color: t.neutral[900] },
  note: { lineHeight: 21.7, ...font(400) },
  pkgSum: { marginBottom: 6, fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[500] },
  pkgList: { overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10, backgroundColor: t.neutral[0] },
  pkgItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingLeft: 7, paddingRight: 10 },
  pkgLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  pkgPressed: { backgroundColor: t.neutral[50] },
  pkgImg: { width: 34, height: 34, flexShrink: 0, overflow: 'hidden', borderRadius: 6, backgroundColor: t.neutral[100] },
  pkgQty: { flexShrink: 0, minWidth: 28, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.primary[700] },
  pkgName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18.9, ...font(400), color: t.neutral[900] },
  pkgCaret: { flexShrink: 0 },
}));
