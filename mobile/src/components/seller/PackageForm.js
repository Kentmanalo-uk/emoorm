import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  BackHandler, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import apiClient from '../../api/client';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import { PACKAGE_KINDS, packageItemsLabel, productKind } from './productKinds';
import { sellerPageStyles } from './SellerPage';
import PhoneSaveBar, { PhoneSaveButton, savebarSpace } from './PhoneSaveBar';
import OrderConfirmDialog from '../orders/OrderConfirmDialog';
import {
  DESCRIPTION_MIN, LAST_STEP, MAX_EACH, MAX_LINES, NAME_FOR_KIND, NAME_MIN, NOTICE_HOURS, P, STOCK_MAX,
  aheadText, canHold, firstImage, isWhole, priceOf, toFormState,
} from './package-form/pkfLib';
import { Note, Section } from './package-form/PkfBits';
import ProductsStep, { PackageTotal } from './package-form/ProductsStep';
import NamePriceStep from './package-form/NamePriceStep';
import PhotoStep from './package-form/PhotoStep';
import PackagePreview from './package-form/PackagePreview';

/*
 * Create or edit a package on phones (web/src/components/seller/
 * PackageForm.jsx + PackageForm.css ≤768px, PhoneSaveBar.css): some of the
 * shop's own products sold together at one price. One step per screen:
 *   1 What's in it           products and how many of each
 *   2 Name and price         what it is for, a name, one price, how many
 *   3 Photo and description  optional: the items' photos and an "Includes…"
 *                            line stand in when left empty
 *   4 Review                 what buyers will see
 * The website keeps the step in the address (?step=2) so the browser's back
 * goes back a step; here the step is state: the bar's Back and Android's back
 * button go back a step, and on step 1 they leave.
 *
 * Rendered by app/seller/products/new.js inside <SellerPage scroll={false}>
 * (the page bar comes from there): this brings its own ScrollView and the
 * Back / Next bar floating at the bottom.
 *
 * <PackageForm product={null|package} store onCancel onSaved={(saved, { created })} sellBlockers />
 */

const CONTENT_TOP = StyleSheet.flatten(sellerPageStyles.content).paddingTop || 0;
// .pkf-total sticks this far above the screen's bottom (76px + the home bar).
const STICKY_BOTTOM = 76;
// The first problem's place, in the order the website's page shows them.
const ERROR_ORDER = ['items', 'name', 'price', 'stock', 'description'];

export default function PackageForm({
  product = null, store = null, onCancel, onSaved, sellBlockers = [],
}) {
  const editing = !!product;
  const insets = useSafeAreaInsets();
  const [initial] = useState(() => toFormState(product));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The step on screen.
  const [step, setStep] = useState(1);

  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const anchors = useRef({});
  const anchor = useCallback((key) => (node) => { anchors.current[key] = node; }, []);

  // The shop's products to choose from: the first 100 (newest first); a
  // shop with more is searched on the server.
  const [shopProducts, setShopProducts] = useState(null);
  const [shopTotal, setShopTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  useEffect(() => {
    let live = true;
    apiClient.get('/products/my/products', { params: { pageSize: 100 } })
      .then((res) => {
        if (!live) return;
        setShopProducts(res.data || []);
        setShopTotal(res.pagination?.total || 0);
      })
      .catch((err) => {
        if (!live) return;
        setShopProducts([]);
        toast.error(err.message || 'Could not load your products');
      });
    return () => { live = false; };
  }, []);

  const searching = shopTotal > 100 ? query.trim() : '';
  useEffect(() => {
    if (!searching) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      apiClient.get('/products/my/products', { params: { pageSize: 50, search: searching } })
        .then((res) => { if (live) setFound({ q: searching, list: res.data || [] }); })
        .catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [searching]);
  const serverFound = searching && found?.q === searching ? found.list : null;

  // Couriers only take packages of weighed goods: say so when the shop uses them.
  const [couriersOn, setCouriersOn] = useState(false);
  useEffect(() => {
    let live = true;
    apiClient.get('/couriers/my-store')
      .then((res) => { if (live) setCouriersOn((res.data?.couriers || []).length > 0); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // A new step starts at the top of the screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  // After a failed check, bring the first problem into view (centred, as the website).
  const viewport = useRef(0);
  useEffect(() => {
    if (!attempt) return undefined;
    const timer = setTimeout(() => {
      const key = ERROR_ORDER.find((k) => errors[k]);
      const node = key ? anchors.current[key] : null;
      if (!node || !contentRef.current) return;
      node.measureLayout(contentRef.current, (x, y, w, h) => {
        const top = CONTENT_TOP + y + h / 2 - viewport.current / 2;
        scrollRef.current?.scrollTo({ y: Math.max(0, top), animated: true });
      }, () => {});
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  /* ── what's in it ───────────────────────────────────────────── */
  const fresh = useMemo(() => new Map((shopProducts || []).map((p) => [p.id, p])), [shopProducts]);
  // An item as it is now (the list), or as the package last saved it.
  const itemOf = (line) => fresh.get(line.productId) || line.product || { id: line.productId, name: 'A product' };
  // An item deleted since (it can't be saved in), or one buyers can't see.
  const lineIssue = (line) => {
    const p = itemOf(line);
    if (p.deletedAt) return 'gone';
    if (['SUSPENDED', 'ARCHIVED'].includes(p.status)) return 'hidden';
    return null;
  };

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (p) => !q || String(p?.name || '').toLowerCase().includes(q);
    const loaded = serverFound
      ? serverFound.filter(canHold)
      : (shopProducts || []).filter((p) => canHold(p) && matches(p));
    const byId = new Map(loaded.map((p) => [p.id, p]));
    // The package's own items first, as it was opened; the rest stay put
    // while the seller ticks them.
    const first = initial.items
      .map((l) => byId.get(l.productId) || (l.product && matches(l.product) ? l.product : null))
      .filter(Boolean);
    const firstIds = new Set(first.map((p) => p.id));
    return [...first, ...loaded.filter((p) => !firstIds.has(p.id))];
  }, [query, serverFound, shopProducts, initial]);

  const leftOut = (shopProducts || []).filter((p) => !p.deletedAt && ['PACKAGE', 'LIVESTOCK'].includes(productKind(p))).length;
  const lineFor = (id) => form.items.find((l) => l.productId === id);
  const units = form.items.reduce((sum, l) => sum + l.quantity, 0);
  const worth = Math.round(form.items.reduce((sum, l) => sum + priceOf(itemOf(l)) * l.quantity, 0) * 100) / 100;

  const toggleItem = (p) => {
    if (lineFor(p.id)) {
      set('items', form.items.filter((l) => l.productId !== p.id));
      return;
    }
    if (form.items.length >= MAX_LINES) {
      toast.error(`A package holds up to ${MAX_LINES} different products`);
      return;
    }
    set('items', [...form.items, { productId: p.id, quantity: 1, product: p }]);
  };

  const setQuantity = (id, n) => {
    set('items', n < 1
      ? form.items.filter((l) => l.productId !== id)
      : form.items.map((l) => (l.productId === id ? { ...l, quantity: Math.min(MAX_EACH, n) } : l)));
  };

  /* ── name and price ─────────────────────────────────────────── */
  const pickKind = (key) => {
    const next = form.packageKind === key ? '' : key;
    const suggested = NAME_FOR_KIND[form.packageKind] || '';
    const name = form.name.trim();
    // The name follows the choice until the seller types their own.
    const follow = !name || name === suggested;
    setForm((f) => ({ ...f, packageKind: next, name: follow ? NAME_FOR_KIND[next] || '' : f.name }));
    if (follow && errors.name) setErrors((e) => ({ ...e, name: '' }));
  };

  const price = Number(form.price);
  const saved = worth > 0 && price > 0 ? Math.round((worth - price) * 100) / 100 : null;
  const percent = saved > 0 ? Math.round((saved / worth) * 100) : 0;

  const stockNumber = parseInt(form.stock, 10) || 0;
  const noticeChoices = form.noticeHours && !NOTICE_HOURS.includes(form.noticeHours)
    ? [...NOTICE_HOURS, form.noticeHours]
    : NOTICE_HOURS;

  // How buyers get it: asked only when the shop offers both.
  const shopMode = store?.fulfillmentMode || null;
  const askWay = !shopMode || shopMode === 'BOTH';
  const wayChoices = [
    { key: form.fulfillment === 'BOTH' ? 'BOTH' : null, label: 'Pickup or delivery', hint: 'Buyers choose' },
    { key: 'PICKUP', label: 'Pickup only', hint: 'Buyers pick it up from you' },
    { key: 'DELIVERY', label: 'Delivery only', hint: 'You bring it to buyers' },
  ];
  const wayOn = (key) => (key === null || key === 'BOTH' ? !form.fulfillment || form.fulfillment === 'BOTH' : form.fulfillment === key);
  const pickupOnly = shopMode === 'PICKUP' || (askWay && form.fulfillment === 'PICKUP');
  const deliveryOnly = shopMode === 'DELIVERY' || (askWay && form.fulfillment === 'DELIVERY');
  const wayText = pickupOnly ? 'Pickup only' : deliveryOnly ? 'Delivery only' : 'Pickup or delivery';
  const courierOk = form.items.length > 0 && form.items.every((l) => {
    const p = fresh.get(l.productId);
    return p && productKind(p) === 'REGULAR' && Number(p.weightGrams) > 0;
  });
  const courierNote = couriersOn && !pickupOnly && form.items.length > 0 && !courierOk;

  /* ── photo and words ────────────────────────────────────────── */
  const itemPhotos = form.items.map((l) => firstImage(itemOf(l))).filter(Boolean).slice(0, 4);
  const photos = form.images.length ? form.images : itemPhotos;
  const contents = packageItemsLabel(form.items.map((l) => ({ quantity: l.quantity, product: { name: itemOf(l).name } })));
  const autoDescription = contents ? `Includes: ${contents}` : '';

  /* ── checks and saving ──────────────────────────────────────── */
  const check = (f, only) => {
    const errs = {};
    const want = (n) => !only || only === n;
    if (want(1)) {
      const total = f.items.reduce((sum, l) => sum + l.quantity, 0);
      const gone = f.items.find((l) => lineIssue(l) === 'gone');
      if (!f.items.length) errs.items = 'Choose the products in this package.';
      else if (gone) errs.items = `${itemOf(gone).name} is no longer in your shop. Take it out of the package.`;
      else if (total < 2) errs.items = 'A package needs at least 2 items. Add another product, or more of this one.';
    }
    if (want(2)) {
      const name = f.name.trim();
      if (!name) errs.name = 'Give the package a name.';
      else if (name.length < NAME_MIN) errs.name = 'The name is too short.';
      if (!(Number(f.price) > 0)) errs.price = 'Enter the package price (more than ₱0).';
      if (String(f.stock).trim() === '') errs.stock = 'Say how many packages you can sell.';
      else if (!isWhole(f.stock) || Number(f.stock) > STOCK_MAX) errs.stock = 'Enter a whole number, like 5.';
    }
    if (want(3)) {
      const text = f.description.trim();
      if (text && text.length < DESCRIPTION_MIN) {
        errs.description = `Write a little more (at least ${DESCRIPTION_MIN} letters), or leave it empty.`;
      }
    }
    return errs;
  };

  const stepOf = (errs) => (errs.items ? 1 : errs.name || errs.price || errs.stock ? 2 : 3);

  const goNext = () => {
    const errs = check(form, step);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error('Please check the highlighted part.');
      setAttempt((n) => n + 1);
      return;
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const requestCancel = () => {
    if (dirty && !saving) setConfirmLeave(true);
    else onCancel?.();
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else requestCancel();
  };

  // Android's back button: a step back, and out from step 1.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving) return true;
      if (step > 1) {
        setStep(step - 1);
        return true;
      }
      onCancel?.();
      return true;
    });
    return () => sub.remove();
  }, [step, saving, onCancel]));

  const save = async () => {
    if (saving) return;
    // Enter in a field moves on rather than saving early.
    if (step < LAST_STEP) {
      goNext();
      return;
    }
    const errs = check(form);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error('Please check the highlighted parts.');
      if (stepOf(errs) < step) setStep(stepOf(errs));
      setAttempt((n) => n + 1);
      return;
    }

    const details = {};
    if (form.packageKind) details.packageKind = form.packageKind;
    if (Number(form.noticeHours) > 0) details.noticeHours = Number(form.noticeHours);
    const payload = {
      productType: 'PACKAGE',
      name: form.name.trim(),
      price: Number(form.price),
      stock: parseInt(form.stock, 10),
      packageItems: form.items.map(({ productId, quantity }) => ({ productId, quantity })),
      details,
      // Empty: the server writes "Includes: …" and uses the items' photos,
      // and keeps them up to date when the items change.
      description: form.description.trim(),
      images: form.images,
      // A shop that offers one way only: as the shop.
      fulfillment: askWay ? form.fulfillment : null,
    };
    if (editing) {
      // The count this form opened with, so packages sold meanwhile are kept.
      payload.stockWas = Number(product.stock) || 0;
    } else {
      // Packages are made a few at a time: only "sold out" is worth a warning.
      payload.lowStockThreshold = 0;
    }

    setSaving(true);
    try {
      const res = editing
        ? await apiClient.put(`/products/${product.id}`, payload)
        : await apiClient.post('/products', payload);
      onSaved?.(res?.data || null, { created: !editing });
    } catch (err) {
      toast.error(err.message || 'Could not save the package. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = editing ? 'Save changes' : 'Add package';

  /* ── the total floating above Back / Next (.pkf-total.is-on, sticky) ── */
  const totalRef = useRef(null);
  const scrollY = useRef(0);
  const totalBox = useRef(null);
  const [floating, setFloating] = useState(false);
  const stickyBottom = STICKY_BOTTOM + insets.bottom;
  const canFloat = step === 1 && form.items.length > 0;
  const updateFloat = useCallback(() => {
    const box = totalBox.current;
    const next = !!(canFloat && box && viewport.current
      && CONTENT_TOP + box.y + box.h > scrollY.current + viewport.current - stickyBottom);
    setFloating((cur) => (cur === next ? cur : next));
  }, [canFloat, stickyBottom]);
  const measureTotal = useCallback(() => {
    if (!totalRef.current || !contentRef.current) {
      totalBox.current = null;
      updateFloat();
      return;
    }
    totalRef.current.measureLayout(contentRef.current, (x, y, w, h) => {
      totalBox.current = { y, h };
      updateFloat();
    }, () => {});
  }, [updateFloat]);
  useEffect(() => { updateFloat(); }, [updateFloat]);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[sellerPageStyles.content, { paddingBottom: savebarSpace(insets) + 32 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          updateFloat();
        }}
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.height;
          updateFloat();
        }}
        onContentSizeChange={measureTotal}
      >
        <View ref={contentRef} collapsable={false} style={styles.pkf}>
          <View style={styles.progress}>
            <Text style={styles.progressText}>{editing ? 'Edit package' : 'New package'} · Step {step} of {LAST_STEP}</Text>
            <View style={styles.progressBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[1, 2, 3, 4].map((n) => <View key={n} style={[styles.progressPart, n <= step && styles.progressOn]} />)}
            </View>
          </View>

          {step === 1 && (sellBlockers?.length > 0 ? (
            <Note draft>
              Buyers can see this package, but can&apos;t order it until your shop is ready to sell.
              {' '}Still to do: {sellBlockers.map((b) => b.label).join(', ')}.
            </Note>
          ) : editing && product.status === 'APPROVED' ? (
            <Note>This package is live. Your changes show to buyers as soon as you save.</Note>
          ) : null)}

          {step === 1 ? (
            <ProductsStep
              ref={anchor('items')}
              query={query}
              onQuery={setQuery}
              shopProducts={shopProducts}
              choices={choices}
              lineFor={lineFor}
              lineIssue={lineIssue}
              onToggle={toggleItem}
              onQuantity={setQuantity}
              leftOut={leftOut}
              lines={form.items.length}
              units={units}
              worth={worth}
              error={errors.items}
              totalRef={totalRef}
              onTotalLayout={measureTotal}
              totalFloating={floating}
            />
          ) : null}

          {step === 2 ? (
            <NamePriceStep
              form={form}
              errors={errors}
              set={set}
              onPickKind={pickKind}
              worth={worth}
              saved={saved}
              percent={percent}
              stockNumber={stockNumber}
              noticeChoices={noticeChoices}
              askWay={askWay}
              shopMode={shopMode}
              wayChoices={wayChoices}
              wayOn={wayOn}
              courierNote={courierNote}
              onSubmit={save}
              anchor={anchor}
            />
          ) : null}

          {step === 3 ? (
            <PhotoStep
              ref={anchor('description')}
              form={form}
              errors={errors}
              set={set}
              itemPhotos={itemPhotos}
              autoDescription={autoDescription}
            />
          ) : null}

          {step === 4 ? (
            <Section title="Review" hint="This is how buyers will see your package.">
              <PackagePreview
                photos={photos}
                kind={PACKAGE_KINDS.find((k) => k.key === form.packageKind && k.key !== 'OTHER')?.label}
                name={form.name.trim()}
                price={price}
                worth={worth}
                saved={saved}
                items={form.items.map((l) => ({ ...l, item: itemOf(l) }))}
                stock={form.stock === '' ? null : stockNumber}
                ahead={Number(form.noticeHours) > 0 ? aheadText(form.noticeHours) : ''}
                way={wayText}
                description={form.description.trim() || autoDescription}
                onEdit={(n) => setStep(n)}
              />
            </Section>
          ) : null}
        </View>
      </ScrollView>

      {floating ? (
        <View pointerEvents="none" style={[styles.floatTotal, { bottom: stickyBottom }]}>
          <PackageTotal lines={form.items.length} units={units} worth={worth} />
        </View>
      ) : null}

      <PhoneSaveBar>
        <PhoneSaveButton label={step > 1 ? 'Back' : 'Cancel'} onPress={goBack} disabled={saving} />
        {step < LAST_STEP ? (
          <PhoneSaveButton
            primary
            label={step === 3 && !form.images.length && !form.description.trim() ? 'Skip' : 'Next'}
            onPress={goNext}
          />
        ) : (
          <PhoneSaveButton primary label={saveLabel} busy={saving} busyLabel="Saving…" onPress={save} />
        )}
      </PhoneSaveBar>

      <OrderConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="What you entered for this package will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => { setConfirmLeave(false); onCancel?.(); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pkf: { gap: 12 },
  progress: { gap: 8, paddingTop: 4, paddingHorizontal: 2 },
  progressText: { fontSize: 13, lineHeight: 20.8, color: P.muted, ...font(400) },
  progressBar: { flexDirection: 'row', gap: 6 },
  progressPart: { flex: 1, height: 4, borderRadius: 999, backgroundColor: t.neutral[200] },
  progressOn: { backgroundColor: P.green },
  // In line with the step's card: the 12px page gutter and the card's 16px padding.
  floatTotal: { position: 'absolute', left: 28, right: 28, zIndex: 50 },
});
