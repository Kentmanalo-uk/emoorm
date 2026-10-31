import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PackageIcon } from '../../../lib/icons';
import { font, t, themed, veil } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { P, firstImage, peso } from './pkfLib';
import { Thumb, pkfStyles } from './PkfBits';

/*
 * Step 4: roughly what buyers see on the package's page (web
 * PackageForm.jsx Preview, PackageForm.css .pkf-preview, ≤768px).
 */
export default function PackagePreview({
  photos, kind, name, price, worth, saved, items, stock, ahead, way, description, onEdit,
}) {
  const [cover, ...rest] = photos;
  return (
    <View style={styles.preview}>
      <View style={styles.photo}>
        {cover
          ? <Image source={{ uri: resolveImg(cover) || cover }} style={styles.photoImg} resizeMode="cover" />
          : <PackageIcon size={40} color={t.neutral[400]} />}
        <View style={styles.badge}>
          <PackageIcon size={13} weight="fill" color={P.greenDark} />
          <Text style={styles.badgeText}>Package</Text>
        </View>
      </View>
      {rest.length > 0 ? (
        <View style={styles.thumbs}>
          {rest.slice(0, 4).map((src, i) => <Thumb key={`${src}-${i}`} src={src} style={styles.thumb} />)}
        </View>
      ) : null}
      <View style={styles.body}>
        {kind ? (
          <View style={styles.kind}><Text style={styles.kindText}>{kind}</Text></View>
        ) : null}
        <Text style={[styles.name, !name && styles.nameEmpty]}>{name || 'Your package name'}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{price > 0 ? peso(price) : '₱ —'}</Text>
          <Text style={styles.per}>/ package</Text>
        </View>
        {saved > 0 ? (
          <Text style={styles.save}>
            <Text style={styles.was}>{peso(worth)}</Text>
            {' '}Save {peso(saved)}
          </Text>
        ) : null}

        <View style={styles.block}>
          <View style={styles.head}>
            <Text style={styles.h4}>What&apos;s included</Text>
            {onEdit ? <EditLink onPress={() => onEdit(1)} /> : null}
          </View>
          {items.length ? (
            <View style={styles.items}>
              {items.map((l) => (
                <View key={l.productId} style={styles.item}>
                  <Thumb src={firstImage(l.item)} style={styles.itemPic} iconSize={16} />
                  <Text style={styles.itemText}>
                    <Text style={styles.itemQty}>{l.quantity} x</Text>
                    {' '}{l.item.name}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.none}>No products chosen yet.</Text>
          )}
        </View>

        <View style={styles.facts}>
          {stock !== null ? (
            <Fact text={stock > 0 ? `${stock} ${stock === 1 ? 'package' : 'packages'} available` : 'Sold out'} />
          ) : null}
          {ahead ? <Fact text={`Order at least ${ahead} ahead`} /> : null}
          <Fact text={way} />
        </View>

        {description ? (
          <View style={styles.block}>
            <View style={styles.head}>
              <Text style={styles.h4}>Description</Text>
              {onEdit ? <EditLink onPress={() => onEdit(3)} /> : null}
            </View>
            <Text style={styles.desc}>{description}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function EditLink({ onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={[pkfStyles.link, styles.editLink]}>
      <Text style={[pkfStyles.linkText, styles.editLinkText]}>Change</Text>
    </Pressable>
  );
}

function Fact({ text }) {
  return (
    <View style={styles.fact}><Text style={styles.factText}>{text}</Text></View>
  );
}

const styles = themed(() => StyleSheet.create({
  preview: {
    overflow: 'hidden', borderWidth: 1, borderColor: P.line, borderRadius: 14, backgroundColor: t.neutral[0],
  },
  photo: {
    width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  photoImg: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: veil(0.94),
  },
  badgeText: { fontSize: 12, lineHeight: 19.2, color: P.greenDark, ...font(600) },
  thumbs: { flexDirection: 'row', gap: 6, paddingTop: 8, paddingHorizontal: 12 },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  body: { gap: 8, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 16 },
  kind: {
    alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.accent[50],
  },
  kindText: { fontSize: 12, lineHeight: 19.2, color: t.accent[700], ...font(600) },
  name: { fontSize: 17, lineHeight: 22.1, color: P.ink, ...font(500) },
  nameEmpty: { color: t.neutral[400] },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { fontSize: 21, lineHeight: 33.6, color: P.green, ...font(600) },
  per: { fontSize: 13, lineHeight: 20.8, color: P.muted, ...font(400) },
  save: { marginTop: -4, fontSize: 13, lineHeight: 20.8, color: P.greenDark, ...font(500) },
  was: { color: P.muted, textDecorationLine: 'line-through', ...font(400) },
  block: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h4: { fontSize: 14, lineHeight: 16.1, color: P.ink, ...font(500) },
  editLink: { alignSelf: 'auto', minHeight: 28 },
  editLinkText: { color: P.greenDark },
  items: { gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemPic: { width: 36, height: 36, borderRadius: 8 },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 18.225, color: t.neutral[800], ...font(400) },
  itemQty: { ...font(600) },
  none: { fontSize: 13, lineHeight: 20.8, color: P.muted, ...font(400) },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  fact: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.neutral[100] },
  factText: { fontSize: 12.5, lineHeight: 20, color: t.neutral[700], ...font(400) },
  desc: { fontSize: 13.5, lineHeight: 20.25, color: t.neutral[700], ...font(400) },
}));
