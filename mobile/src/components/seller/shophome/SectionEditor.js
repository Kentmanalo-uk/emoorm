import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowDownIcon, ArrowUpIcon, CaretDownIcon, CheckIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon, UploadSimpleIcon, XIcon,
} from '../../../lib/icons';
import ProductImage from '../../ProductImage';
import Select from '../../Select';
import { peso } from '../../SaleTag';
import { resolveImg } from '../../../lib/media';
import { uploadImage } from '../../../lib/upload';
import { toast } from '../../../lib/toast';
import { font, t, themed } from '../../../theme';
import { SECTION_KINDS, sectionReady } from './shopHome';
import StyleThumb from './StyleThumb';
import { Grid2, KindIcon, ShbIconButton, ShbLabel, shb } from './shbParts';

/*
 * One section of the Shop home builder (web SellerShopHome.jsx SectionEditor,
 * PhotosField, SpotlightField + SellerShopHome.css, phones): a card whose
 * head shows the kind, its name and style, with move and remove; open, it
 * edits the style, the heading and the photos, products or message.
 */

const HEADING_PLACEHOLDER = {
  banner: 'e.g. Harvest sale',
  gallery: 'e.g. Our farm in Baco',
  message: 'e.g. Open daily, 7am to 6pm',
  spotlight: 'e.g. Best sellers',
};

/** A text field in the .shb-input look, green-edged while typing. */
function ShbInput({ style, multiline, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor={t.neutral[400]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[shb.input, focused && shb.inputFocus, style]}
    />
  );
}

export default function SectionEditor({
  section: s, index, count, open, onToggle, onChange, onMove, onRemove, products, lookup, onLayout,
}) {
  const kind = SECTION_KINDS[s.type];
  const style = kind.styles.find((x) => x.key === s.style) || kind.styles[0];
  const ready = sectionReady(s);
  return (
    <View onLayout={onLayout} style={[styles.sec, open && styles.secOpen, !ready && !open && styles.secIncomplete]}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={styles.toggle}
        >
          <KindIcon kind={s.type} />
          <View style={styles.name}>
            <Text style={styles.nameText} numberOfLines={1}>{s.title || kind.label}</Text>
            <Text style={[styles.nameSmall, !ready && styles.nameSmallWarn]} numberOfLines={1}>
              {`${kind.label} · ${style.name}${ready ? '' : ' · needs content'}`}
            </Text>
          </View>
          <View style={[styles.caret, open && styles.caretOpen]}>
            <CaretDownIcon size={16} weight="bold" color={t.neutral[500]} />
          </View>
        </Pressable>
        <View style={styles.tools}>
          <ShbIconButton Icon={ArrowUpIcon} label="Move up" onPress={() => onMove(-1)} disabled={index === 0} />
          <ShbIconButton Icon={ArrowDownIcon} label="Move down" onPress={() => onMove(1)} disabled={index === count - 1} />
          <ShbIconButton Icon={TrashIcon} label="Remove section" onPress={onRemove} danger />
        </View>
      </View>

      {open ? (
        <View style={styles.body}>
          <View style={shb.field}>
            <ShbLabel>Style</ShbLabel>
            <View accessibilityRole="radiogroup" accessibilityLabel={`${kind.label} style`}>
              <Grid2 gap={8} stretch>
              {kind.styles.map((st) => {
                const on = s.style === st.key;
                return (
                  <Pressable
                    key={st.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => onChange({ style: st.key })}
                    style={[styles.styleCard, on && styles.styleOn]}
                  >
                    <StyleThumb kind={s.type} styleKey={st.key} on={on} />
                    <Text style={styles.styleName}>{st.name}</Text>
                    <Text style={styles.styleDesc}>{st.desc}</Text>
                  </Pressable>
                );
              })}
              </Grid2>
            </View>
          </View>

          <View style={shb.field}>
            <ShbLabel em={s.type !== 'spotlight' ? '(optional)' : null}>Heading</ShbLabel>
            <ShbInput
              value={s.title || ''}
              maxLength={60}
              placeholder={HEADING_PLACEHOLDER[s.type] || HEADING_PLACEHOLDER.spotlight}
              onChangeText={(text) => onChange({ title: text })}
              accessibilityLabel="Heading"
            />
          </View>

          {(s.type === 'banner' || s.type === 'gallery') ? (
            <PhotosField section={s} max={kind.maxImages} onChange={onChange} products={products} />
          ) : null}
          {s.type === 'spotlight' ? (
            <SpotlightField section={s} max={kind.maxProducts} onChange={onChange} products={products} lookup={lookup} />
          ) : null}
          {s.type === 'message' ? (
            <View style={shb.field}>
              <ShbLabel>Message</ShbLabel>
              <ShbInput
                multiline
                maxLength={400}
                value={s.body || ''}
                placeholder="e.g. All our vegetables are picked the morning you order. Message us for bulk orders!"
                onChangeText={(text) => onChange({ body: text })}
                style={styles.textarea}
                accessibilityLabel="Message"
              />
              <Text style={styles.count}>{`${(s.body || '').length}/400`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PhotosField({ section: s, max, onChange, products }) {
  const [busy, setBusy] = useState(0);
  const images = s.images || [];
  const setImg = (i, changes) => onChange({ images: images.map((img, j) => (j === i ? { ...img, ...changes } : img)) });
  const productOptions = [
    { value: '', label: 'No link' },
    ...products.map((p) => ({ value: p.id, label: `Opens: ${p.name}` })),
  ];

  const addPhotos = async () => {
    const room = max - images.length;
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.9,
      });
    } catch {
      toast.error('Could not open your photos');
      return;
    }
    if (result.canceled) return;
    const assets = result.assets || [];
    const list = assets.slice(0, room);
    if (assets.length > room) toast.info(`Only ${max} photos fit in this section.`);
    let next = [...images];
    for (const asset of list) {
      setBusy((n) => n + 1);
      try {
        const { url } = await uploadImage(asset);
        next = [...next, s.type === 'banner' ? { url, productId: null } : { url, caption: '' }];
        onChange({ images: next });
      } catch (err) {
        toast.error(err.message || 'Upload failed');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  return (
    <View style={shb.field}>
      <ShbLabel em={`${images.length}/${max}`}>Photos</ShbLabel>
      <Grid2 gap={10}>
        {images.map((img, i) => (
          <View style={styles.photo} key={`${img.url}-${i}`}>
            <View style={styles.photoImg}>
              <Image source={{ uri: resolveImg(img.url) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={6}
                onPress={() => onChange({ images: images.filter((_, j) => j !== i) })}
                style={styles.photoX}
              >
                <XIcon size={13} weight="bold" color="#fff" />
              </Pressable>
            </View>
            {s.type === 'banner' ? (
              <Select
                value={img.productId || ''}
                options={productOptions}
                onChange={(v) => setImg(i, { productId: v || null })}
                title="Opens product"
                accessibilityLabel="Opens product"
                style={styles.photoLink}
                textStyle={styles.photoLinkText}
                caretSize={12}
              />
            ) : (
              <ShbInput
                value={img.caption || ''}
                maxLength={80}
                placeholder="Caption (optional)"
                onChangeText={(text) => setImg(i, { caption: text })}
                style={[styles.photoLink, styles.photoLinkText, styles.photoCaption]}
                accessibilityLabel="Caption"
              />
            )}
          </View>
        ))}
        {images.length < max ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy > 0}
            onPress={addPhotos}
            style={[styles.photo, styles.photoAdd]}
          >
            <UploadSimpleIcon size={22} color={t.primary[700]} />
            <Text style={styles.photoAddText}>{busy ? 'Uploading…' : 'Add photos'}</Text>
          </Pressable>
        ) : null}
      </Grid2>
      <Text style={shb.hint}>
        {s.type === 'banner' ? 'Wide photos look best (about 2 : 1). A photo can open one of your products.' : 'Photos of your shop, farm or workshop.'}
      </Text>
    </View>
  );
}

function SpotlightField({ section: s, max, onChange, products, lookup }) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const ids = s.productIds || [];
  const picked = ids.map((id) => lookup.get(id)).filter(Boolean);
  const toggle = (id) => {
    if (ids.includes(id)) onChange({ productIds: ids.filter((x) => x !== id) });
    else if (ids.length >= max) toast.info(`Up to ${max} products in one spotlight.`);
    else onChange({ productIds: [...ids, id] });
  };
  const moveOne = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ productIds: next });
  };
  const shown = products.filter((p) => String(p.name || '').toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={shb.field}>
      <ShbLabel em={`${ids.length}/${max}`}>Products</ShbLabel>
      {picked.length > 0 ? (
        <View style={styles.list}>
          {picked.map((p, i) => (
            <View key={p.id} style={styles.picked}>
              <ProductImage src={p.images?.[0] || null} style={shb.thumbImg} />
              <View style={shb.pickedName}>
                <Text style={shb.pickedNameText} numberOfLines={1}>{p.name}</Text>
                <Text style={shb.pickedPrice}>{peso(p.price)}</Text>
              </View>
              <ShbIconButton Icon={ArrowUpIcon} size={14} label="Move up" onPress={() => moveOne(i, -1)} disabled={i === 0} />
              <ShbIconButton Icon={ArrowDownIcon} size={14} label="Move down" onPress={() => moveOne(i, 1)} disabled={i === picked.length - 1} />
              <ShbIconButton Icon={XIcon} size={14} label={`Remove ${p.name}`} onPress={() => toggle(p.id)} danger />
            </View>
          ))}
        </View>
      ) : null}
      {products.length === 0 ? (
        <Text style={shb.hint}>Your live products show up here to pick from.</Text>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setPicking((v) => !v)} style={styles.pickBtn}>
          <PlusIcon size={15} weight="bold" color={t.primary[700]} />
          <Text style={styles.pickBtnText}>{picking ? 'Done choosing' : ids.length ? 'Choose more products' : 'Choose products'}</Text>
        </Pressable>
      )}
      {picking ? (
        <View style={styles.picker}>
          <View style={styles.search}>
            <MagnifyingGlassIcon size={15} color={t.neutral[500]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your products"
              placeholderTextColor={t.neutral[400]}
              style={styles.searchInput}
              accessibilityLabel="Search your products"
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.pickList} contentContainerStyle={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {shown.map((p) => {
              const on = ids.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(p.id)}
                  style={[styles.pick, on && styles.pickOn]}
                >
                  <ProductImage src={p.images?.[0] || null} style={shb.thumbImg} />
                  <View style={shb.pickedName}>
                    <Text style={shb.pickedNameText} numberOfLines={1}>{p.name}</Text>
                    <Text style={shb.pickedPrice}>{peso(p.price)}</Text>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <CheckIcon size={12} weight="bold" color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })}
            {shown.length === 0 ? <Text style={shb.hint}>{`No product matches “${query}”.`}</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // .shb-sec
  sec: { borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 16, backgroundColor: t.neutral[0] },
  secOpen: {
    borderColor: t.primary[300],
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 20, color: 'rgba(5, 150, 105, 0.08)' }],
  },
  secIncomplete: { borderColor: t.warning[300] },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, paddingRight: 10, paddingBottom: 8, paddingLeft: 8 },
  toggle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 4 },
  name: { flexShrink: 1, minWidth: 0 },
  nameText: { fontSize: 14.5, lineHeight: 20, ...font(700), color: t.neutral[900] },
  nameSmall: { fontSize: 12, lineHeight: 17, ...font(400), color: t.neutral[500] },
  nameSmallWarn: { color: t.warning[700] },
  caret: { marginLeft: 'auto' },
  caretOpen: { transform: [{ rotate: '180deg' }] },
  tools: { flexDirection: 'row', gap: 2, flexShrink: 0 },

  body: { gap: 16, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 18, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  textarea: { minHeight: 4 * 21 + 18, lineHeight: 21 },
  count: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, ...font(400), color: t.neutral[500] },

  // Style picker: two across on phones (Grid2).
  styleCard: {
    flex: 1, gap: 3, padding: 8,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 13, backgroundColor: t.neutral[0],
  },
  styleOn: {
    borderColor: t.primary[600], backgroundColor: t.primary[50],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 3, color: 'rgba(16, 185, 129, 0.12)' }],
  },
  styleName: { marginTop: 4, fontSize: 13, lineHeight: 17, ...font(700), color: t.neutral[900] },
  styleDesc: { fontSize: 11.5, lineHeight: 15.5, ...font(400), color: t.neutral[500] },

  // Photos: two across on phones (Grid2).
  photo: { gap: 6, minWidth: 0 },
  photoImg: { aspectRatio: 16 / 10, overflow: 'hidden', borderRadius: 11, backgroundColor: t.neutral[100] },
  photoX: {
    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17, 24, 39, 0.65)',
  },
  photoLink: {
    minHeight: 36, paddingHorizontal: 8, borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 11, backgroundColor: t.neutral[0],
  },
  photoLinkText: { fontSize: 12.5, lineHeight: 17, ...font(400), color: t.neutral[900] },
  photoCaption: { paddingVertical: 6 },
  photoAdd: {
    aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.primary[300], borderRadius: 11, backgroundColor: t.primary[50],
  },
  photoAddText: { fontSize: 13, lineHeight: 18, ...font(600), color: t.primary[700] },

  // Spotlight products
  list: { gap: 6 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12 },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 38, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: t.primary[300], borderRadius: 10, backgroundColor: t.primary[50],
  },
  pickBtnText: { fontSize: 13.5, lineHeight: 18, ...font(600), color: t.primary[700] },
  picker: { gap: 8, padding: 10, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[50] },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 10,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  searchInput: { flex: 1, minWidth: 0, height: 35, padding: 0, fontSize: 14, ...font(400), color: t.neutral[900] },
  pickList: { maxHeight: 320 },
  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6,
    borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12, backgroundColor: t.neutral[0],
  },
  pickOn: { borderColor: t.primary[500], backgroundColor: t.primary[50] },
  check: {
    width: 22, height: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: t.neutral[300], borderRadius: 11,
  },
  checkOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
}));
