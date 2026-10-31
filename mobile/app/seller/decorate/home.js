import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowSquareOutIcon, CheckIcon, EyeIcon, PlusIcon, SparkleIcon, XIcon } from '../../../src/lib/icons';
import apiClient from '../../../src/api/client';
import SellerPage, { SellerPrivateLine, sellerPageStyles } from '../../../src/components/seller/SellerPage';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import PhoneSaveBar, { savebarSpace } from '../../../src/components/seller/PhoneSaveBar';
import OrderConfirmDialog from '../../../src/components/orders/OrderConfirmDialog';
import { ShopGradient } from '../../../src/components/shop/shopTheme';
import {
  HOME_PRESETS, KIND_ORDER, SECTION_KINDS, buildPreset, newSection, sectionReady,
} from '../../../src/components/seller/shophome/shopHome';
import SectionEditor from '../../../src/components/seller/shophome/SectionEditor';
import ShopHomePreviewSheet from '../../../src/components/seller/shophome/ShopHomePreview';
import { KindIcon, ShbIconButton } from '../../../src/components/seller/shophome/shbParts';
import { toast } from '../../../src/lib/toast';
import { font, t, themed } from '../../../src/theme';

/*
 * /seller/decorate/home — Decorate my shop → Shop home (web
 * src/pages/SellerShopHome.jsx + SellerShopHome.css, phones): the seller
 * builds the Home tab of their shop page from sections (banner, spotlight
 * products, gallery, message), each in a style they pick. Phones see what
 * buyers get from the save bar's Preview.
 */
export default function SellerShopHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store, setStore } = useSellerShell();
  const [sections, setSections] = useState([]);
  const [saved, setSaved] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [removing, setRemoving] = useState(null);

  // Where each section sits in the scroll, so a new or unfinished one can be scrolled to.
  const scroller = useRef(null);
  const offsets = useRef({});
  const scrollTarget = useRef(null);
  const scrollTo = (id) => {
    const y = offsets.current[id];
    if (y === undefined) { scrollTarget.current = id; return; }
    scrollTarget.current = null;
    scroller.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get('/stores/my/home').then((r) => r.data?.sections || []).catch(() => []),
      apiClient.get('/products/my/products', { params: { status: 'APPROVED', pageSize: 100 } }).then((r) => r.data || []).catch(() => []),
    ]).then(([home, list]) => {
      if (cancelled) return;
      setSections(home);
      setSaved(JSON.stringify(home));
      setProducts(Array.isArray(list) ? list : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const lookup = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const dirty = JSON.stringify(sections) !== saved;

  const update = (id, changes) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  const move = (id, by) => setSections((list) => {
    const i = list.findIndex((s) => s.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const add = (kind) => {
    const s = newSection(kind);
    setSections((list) => [...list, s]);
    setOpenId(s.id);
    setAdding(false);
    scrollTarget.current = s.id;
  };

  const applyPreset = (p) => {
    const banner = store?.bannerImage || store?.coverImage || null;
    const list = buildPreset(p, {
      banner: banner && banner.startsWith('/uploads/') ? banner : null,
      productIds: products.map((x) => x.id),
      description: store?.description || '',
    });
    setSections(list);
    setOpenId(list[0]?.id || null);
    setPreset(null);
    toast.success(`${p.name} layout added. Change anything, then save.`);
  };

  const save = async () => {
    const notReady = sections.find((s) => !sectionReady(s));
    if (notReady) {
      setOpenId(notReady.id);
      scrollTo(notReady.id);
      toast.error(notReady.type === 'spotlight' ? 'Pick at least one product for the spotlight, or remove it.'
        : notReady.type === 'message' ? 'Write the message, or remove that section.'
          : 'Add at least one photo to that section, or remove it.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put('/stores/my/home', { sections });
      setSaved(JSON.stringify(sections));
      setStore?.((prev) => (prev ? { ...prev, homeLayout: sections.length ? { sections } : null } : prev));
      toast.success(sections.length ? 'Shop home saved. Buyers see it on your shop page.' : 'Home tab removed from your shop page');
    } catch (err) {
      toast.error(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SellerPage>
        <Text style={styles.loading}>Loading your shop home…</Text>
      </SellerPage>
    );
  }

  return (
    <SellerPage scroll={false} privateLine={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={scroller}
        style={styles.flex}
        contentContainerStyle={[sellerPageStyles.content, styles.editor, { paddingBottom: 16 + savebarSpace(insets) }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <SellerPrivateLine />

        <View style={styles.intro}>
          <ShopGradient angle={135} stops={[[t.primary[50], 0], ['#f0f9ff', 1]]} />
          <View>
            <Text style={styles.introTitle} accessibilityRole="header">Your shop&apos;s Home tab</Text>
            <Text style={styles.introText}>
              The first thing buyers see on your shop page. Mix photos, your best products and a few words, each in the style you like.
            </Text>
          </View>
          {store?.slug ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/store/${store.slug}`)} style={styles.live} hitSlop={6}>
              <Text style={styles.liveText}>View shop</Text>
              <ArrowSquareOutIcon size={13} weight="bold" color={t.primary[700]} />
            </Pressable>
          ) : null}
        </View>

        <View accessibilityLabel="Starter layouts">
          <View style={styles.presetsHead}>
            <SparkleIcon size={15} weight="fill" color={t.warning[500]} />
            <Text style={styles.presetsTitle} accessibilityRole="header">Start from a layout</Text>
          </View>
          <View style={styles.presetList}>
            {HOME_PRESETS.map((p) => (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                onPress={() => (sections.length ? setPreset(p) : applyPreset(p))}
                style={({ pressed }) => [styles.preset, pressed && styles.presetPressed]}
              >
                <Text style={styles.presetName}>{p.name}</Text>
                <Text style={styles.presetDesc}>{p.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {sections.length === 0 ? (
          <Text style={styles.empty}>No sections yet. Start from a layout above, or add your own below.</Text>
        ) : null}

        {sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            index={i}
            count={sections.length}
            open={openId === s.id}
            onToggle={() => setOpenId(openId === s.id ? null : s.id)}
            onChange={(changes) => update(s.id, changes)}
            onMove={(by) => move(s.id, by)}
            onRemove={() => setRemoving(s)}
            products={products}
            lookup={lookup}
            onLayout={(e) => {
              offsets.current[s.id] = e.nativeEvent.layout.y;
              if (scrollTarget.current === s.id) setTimeout(() => scrollTo(s.id), 60);
            }}
          />
        ))}

        {adding ? (
          <View style={styles.addPick} accessibilityLabel="Add a section">
            <View style={styles.addHead}>
              <Text style={styles.addTitle}>Add a section</Text>
              <ShbIconButton Icon={XIcon} size={16} label="Close" onPress={() => setAdding(false)} />
            </View>
            <View style={styles.kinds}>
              {KIND_ORDER.map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  onPress={() => add(k)}
                  style={({ pressed }) => [styles.kind, pressed && styles.kindPressed]}
                >
                  <KindIcon kind={k} size={40} radius={12} iconSize={22} />
                  <Text style={styles.kindName}>{SECTION_KINDS[k].label}</Text>
                  <Text style={styles.kindHint}>{SECTION_KINDS[k].hint}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : sections.length < 12 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
          >
            <PlusIcon size={18} weight="bold" color={t.primary[700]} />
            <Text style={styles.addText}>Add a section</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <PhoneSaveBar>
        <Pressable accessibilityRole="button" onPress={() => setPreviewOpen(true)} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
          <EyeIcon size={17} color={t.neutral[800]} />
          <Text style={[styles.btnText, styles.btnGhostText]}>Preview</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || !dirty, busy: saving }}
          disabled={saving || !dirty}
          onPress={save}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, (saving || !dirty) && styles.btnPrimaryOff, pressed && styles.pressed]}
        >
          {saving ? (
            <>
              <ActivityIndicator size={14} color={t.neutral[500]} />
              <Text style={[styles.btnText, styles.btnOffText]}>Saving…</Text>
            </>
          ) : dirty ? (
            <Text style={[styles.btnText, styles.btnPrimaryText]}>Save shop home</Text>
          ) : (
            <>
              <CheckIcon size={16} weight="bold" color={t.neutral[500]} />
              <Text style={[styles.btnText, styles.btnOffText]}>Saved</Text>
            </>
          )}
        </Pressable>
      </PhoneSaveBar>

      <ShopHomePreviewSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        store={store}
        sections={sections}
        lookup={lookup}
      />

      <OrderConfirmDialog
        open={!!preset}
        title={`Use the ${preset?.name || ''} layout?`}
        message="It replaces the sections you have now. Nothing is saved until you tap Save."
        confirmLabel="Use layout"
        onConfirm={() => applyPreset(preset)}
        onCancel={() => setPreset(null)}
      />
      <OrderConfirmDialog
        open={!!removing}
        title="Remove this section?"
        message="It disappears from your Home tab when you save."
        confirmLabel="Remove"
        danger
        onConfirm={() => { setSections((list) => list.filter((s) => s.id !== removing.id)); setRemoving(null); }}
        onCancel={() => setRemoving(null)}
      />
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  loading: { padding: 24, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[500] },
  // .shb-editor: one column, 14px apart.
  editor: { gap: 14 },

  // .shb-intro (phones: stacked)
  intro: { gap: 12, padding: 18, overflow: 'hidden', borderRadius: 18 },
  introTitle: { marginBottom: 4, fontSize: 18, lineHeight: 20.7, ...font(600), color: t.neutral[900] },
  introText: { fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[600] },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  liveText: { fontSize: 13, lineHeight: 18, ...font(600), color: t.primary[700] },

  // .shb-presets
  presetsHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  presetsTitle: { fontSize: 14, lineHeight: 16.1, ...font(600), color: t.neutral[800] },
  presetList: { gap: 10 },
  preset: {
    gap: 4, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[0],
  },
  presetPressed: { borderColor: t.primary[400] },
  presetName: { fontSize: 14, lineHeight: 19, ...font(700), color: t.neutral[900] },
  presetDesc: { fontSize: 12.5, lineHeight: 18.1, ...font(400), color: t.neutral[500] },

  empty: {
    padding: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 14,
    fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500], textAlign: 'center',
  },

  // .shb-add / .shb-add-pick
  add: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.primary[300], borderRadius: 16, backgroundColor: t.neutral[0],
  },
  addPressed: { backgroundColor: t.primary[50] },
  addText: { fontSize: 14.5, lineHeight: 20, ...font(600), color: t.primary[700] },
  addPick: { padding: 14, borderWidth: 1.5, borderColor: t.primary[300], borderRadius: 16, backgroundColor: t.neutral[0] },
  addHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addTitle: { fontSize: 15, lineHeight: 20, ...font(700), color: t.neutral[900] },
  kinds: { gap: 10 },
  kind: { gap: 6, padding: 12, borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[0] },
  kindPressed: { borderColor: t.primary[400] },
  kindName: { fontSize: 14, lineHeight: 19, ...font(700), color: t.neutral[900] },
  kindHint: { fontSize: 12.5, lineHeight: 17.5, ...font(400), color: t.neutral[500] },

  // .shb-savebar .shb-btn (phones: both share the row)
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 46, paddingHorizontal: 22, borderRadius: 14,
  },
  btnGhost: { borderWidth: 1.5, borderColor: t.neutral[200], backgroundColor: t.neutral[0] },
  btnPrimary: { backgroundColor: t.primary[600] },
  btnPrimaryOff: { backgroundColor: t.neutral[200] },
  pressed: { opacity: 0.85 },
  btnText: { fontSize: 15, lineHeight: 20, ...font(700) },
  btnGhostText: { color: t.neutral[800] },
  btnPrimaryText: { color: t.onBrand },
  btnOffText: { color: t.neutral[500] },
}));
