import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ImageIcon, PencilSimpleIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { kindFacts, priceUnit } from '../productKinds';
import { peso } from './formState';
import { PF } from './parts';

const BADGES = {
  READY_TO_EAT: 'Available today',
  COOK_TO_ORDER: 'Cooked to order',
  LIVESTOCK: 'Live animal',
};

/** What buyers will see: the product's card with its key facts (web ReviewStep.jsx PreviewCard, phones). */
export function PreviewCard({ draft, kind, way, todayQty }) {
  const cover = draft.images[0];
  const facts = kind ? kindFacts(draft) : [];
  const unit = priceUnit(draft);
  const price = draft.fromPrice && draft.priceTo ? `from ${peso(draft.price)}` : peso(draft.price);
  return (
    <View style={styles.preview}>
      <View style={styles.img}>
        {cover ? (
          <Image source={{ uri: resolveImg(cover) || cover }} style={styles.imgFill} />
        ) : (
          <View style={styles.noImg}>
            <ImageIcon size={32} color={t.neutral[400]} />
            <Text style={styles.noImgText}>No photo yet</Text>
          </View>
        )}
        {BADGES[kind] ? <Text style={styles.badge}>{BADGES[kind]}</Text> : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{draft.name || 'Your product name'}</Text>
        <View style={styles.price}>
          {draft.salePrice ? (
            <>
              <Text style={styles.priceNow}>{peso(draft.salePrice)}{unit}</Text>
              <Text style={styles.priceWas}>{peso(draft.price)}</Text>
            </>
          ) : (
            <Text style={styles.priceNow}>{draft.price > 0 ? `${price}${unit}` : 'No price yet'}</Text>
          )}
        </View>
        {facts.length > 0 || todayQty > 0 ? (
          <View style={styles.facts}>
            {facts.map((f) => <Text key={f} style={styles.fact}>{f}</Text>)}
            {todayQty > 0 ? <Text style={styles.fact}>{todayQty} left today</Text> : null}
          </View>
        ) : null}
        {way ? <Text style={styles.way}>{way}</Text> : null}
      </View>
    </View>
  );
}

/*
 * Step 4 (web product-form/ReviewStep.jsx): the preview, and on phones a
 * short sum-up of each step with a way back to change it.
 * sections: [{ step, title, lines }]
 */
export default function ReviewStep({ draft, kind, way, todayQty, sections, onEdit }) {
  return (
    <>
      <PreviewCard draft={draft} kind={kind} way={way} todayQty={todayQty} />
      {sections ? (
        <View style={styles.sumup}>
          {sections.map((sec, i) => (
            <View style={[styles.row, i > 0 && styles.rowLine]} key={sec.step}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{sec.title}</Text>
                {sec.lines.filter(Boolean).map((line) => <Text key={line} style={styles.rowLineText}>{line}</Text>)}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Change ${sec.title}`}
                onPress={() => onEdit(sec.step)}
                style={styles.edit}
              >
                <PencilSimpleIcon size={15} color={PF.greenDark} />
                <Text style={styles.editText}>Change</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  preview: { overflow: 'hidden', borderWidth: 1, borderColor: PF.line, borderRadius: 16, backgroundColor: t.neutral[0] },
  img: { aspectRatio: 4 / 3, backgroundColor: t.neutral[100] },
  imgFill: { width: '100%', height: '100%', resizeMode: 'cover' },
  noImg: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noImgText: { color: t.neutral[400], fontSize: 13, lineHeight: 20.8, ...font(400) },
  badge: {
    position: 'absolute', top: 10, left: 10, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.95)', color: PF.greenDark, fontSize: 12, lineHeight: 19.2, ...font(700),
  },
  body: { gap: 8, minWidth: 0, paddingVertical: 16, paddingHorizontal: 18 },
  name: { fontSize: 17, lineHeight: 22.1, color: PF.ink, ...font(600) },
  price: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  priceNow: { color: t.danger[600], fontSize: 20, lineHeight: 32, ...font(700) },
  priceWas: { color: PF.muted, fontSize: 14, lineHeight: 22.4, textDecorationLine: 'line-through', ...font(400) },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: t.neutral[100],
    color: t.neutral[700], fontSize: 12.5, lineHeight: 20, ...font(500),
  },
  way: { fontSize: 13, lineHeight: 20.8, color: PF.muted, ...font(400) },

  sumup: { borderWidth: 1, borderColor: PF.line, borderRadius: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowLine: { borderTopWidth: 1, borderTopColor: PF.line },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { marginBottom: 2, fontSize: 14.5, lineHeight: 23.2, color: PF.ink, ...font(700) },
  rowLineText: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[600], ...font(400) },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 32, paddingHorizontal: 4 },
  editText: { fontSize: 13, lineHeight: 20.8, color: PF.greenDark, ...font(600) },
});
