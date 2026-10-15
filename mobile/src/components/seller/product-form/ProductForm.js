import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarPlusIcon, CheckCircleIcon, CheckIcon, InfoIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import apiClient from '../../../api/client';
import { toast } from '../../../lib/toast';
import { useCartSettings } from '../../cart/cartSettings';
import OrderConfirmDialog from '../../orders/OrderConfirmDialog';
import SellerPage, { sellerPageStyles } from '../SellerPage';
import { useSellerShell } from '../SellerShell';
import PhoneSaveBar, { PhoneSaveButton, savebarSpace } from '../PhoneSaveBar';
import {
  productKind, kindLabel, headsLabel, isLocalDelicacies,
} from '../productKinds';
import BasicsStep from './BasicsStep';
import DetailsStep from './DetailsStep';
import MoreStep from './MoreStep';
import ReviewStep from './ReviewStep';
import FoodStep from './FoodStep';
import { InvalidScrollContext, PF } from './parts';
import {
  STEPS, DETAIL_TITLES, RETURN_POLICIES, MAX_GROUPS,
  toFormState, kindOptions, switchKind, kindOffers, withDrafts, pricedBy, priceSpan, buildPayload,
  checkStep, checkAll, hasErrors, rowsWithErrors, draftProduct, detailLines, policyModeFor,
  emptyGroup, mergeChoices, peso,
} from './formState';

/*
 * Add / edit a product, every kind but packages (web components/seller/
 * ProductForm.jsx, the phone branch): a few easy questions in four steps,
 * Basics, Details for the kind of product, Extras (closed until wanted) and
 * a Review of what buyers will see. One step per screen with Back / Next in
 * the bar at the bottom.
 *
 * The website keeps the step in the address (?step=2) so the phone's back
 * goes back a step; here the step is state, and the top bar's back and
 * Android's back button go back a step the same way. On the first step
 * they leave, as the website's back does.
 *
 * Renders its own SellerPage (the top bar's back has to know the step).
 *
 * Local Delicacies has a shorter form on one page (FoodStep, as the
 * website's): "What kind is it?" is Packed food (kept in stock) or Cooked
 * food (a menu item, posted on Today's menu with its times), and only the
 * food's important parts are asked. An old paluto there still edits as
 * paluto, in the steps.
 */

const FOOD = ['READY_TO_EAT', 'COOK_TO_ORDER'];
// The kinds Local Delicacies' short form is for (an old paluto keeps the steps).
const SHORT_KINDS = [null, 'REGULAR', 'READY_TO_EAT'];
const SHORT_STEPS = [{ key: 'food', title: 'Add a product' }];

const STEP_HINTS = {
  basics: 'What you sell, a photo and its price.',
  more: 'All optional. Skip this step if you don’t need them.',
  review: 'Check it, then add it to your shop.',
};
const DETAIL_HINTS = {
  REGULAR: 'How many you have and how buyers get it.',
  READY_TO_EAT: 'How many you have today, until when, and how buyers get it.',
  COOK_TO_ORDER: 'Sizes, cooking time, and when you cook.',
  LIVESTOCK: 'About the animal, and how buyers get it.',
};

const WAY_TEXT = { PICKUP: 'Pickup only', DELIVERY: 'Delivery only' };

/**
 * @param {Object} [product] - The product being edited
 * @param {Array} categories - Categories to choose from (with their kind)
 * @param {Array<{key, label}>} [sellBlockers] - What the shop still needs
 *   before it can sell; while any are left, buyers see products but cannot order.
 * @param {Function} onPackage - open the package form instead (new products)
 * @param {String} [preset] - 'today' (Create a new menu item in Today's menu):
 *   a new product starts as Local Delicacies' Cooked food; picking another
 *   category keeps Available Today food when that category allows it
 */
export default function ProductForm({
  product = null, categories = [], onCancel, onSaved, onPackage, sellBlockers = [], preset = null,
}) {
  const editing = !!product;
  const insets = useSafeAreaInsets();
  const { store } = useSellerShell();
  const shopMode = store?.fulfillmentMode || null;
  const settings = useCartSettings();
  const todayOn = settings?.availableTodayEnabled !== false;

  const presetToday = !product && todayOn && preset === 'today';
  const foodCategory = categories.find(isLocalDelicacies) || null;
  const [initial, setInitial] = useState(() => {
    const blank = toFormState(product);
    return presetToday
      ? {
        ...blank,
        kind: 'READY_TO_EAT',
        kindPicked: true,
        categoryId: foodCategory?.id || '',
        returnPolicy: RETURN_POLICIES.find((p) => p.key === 'perishable')?.text || '',
      }
      : blank;
  });
  const [form, setForm] = useState(initial);
  const [hasOptions, setHasOptions] = useState(initial.variations.length > 0);
  const [policyMode, setPolicyMode] = useState(() => policyModeFor(initial.returnPolicy));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // What leaving is for: 'cancel' or 'package' (asked while there are changes).
  const [confirmLeave, setConfirmLeave] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [openRows, setOpenRows] = useState([]);
  const [step, setStep] = useState(1);
  // A new live animal just saved: offer to list another like it.
  const [savedAnimal, setSavedAnimal] = useState(null);
  // New cooked food just saved: offer to post it on Today's menu.
  const [savedFood, setSavedFood] = useState(null);
  // Packed food's "More details", closed until wanted.
  const [moreOpen, setMoreOpen] = useState(false);
  const lastSaved = useRef(null);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);

  // A shop that ships with couriers needs every regular product's weight:
  // it is how the shipping fee is worked out.
  const [couriersOn, setCouriersOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiClient.get('/couriers/my-store')
      .then((res) => { if (!cancelled) setCouriersOn((res.data?.couriers || []).length > 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // A new step (or the "listed" screen) starts at the top of the screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step, savedAnimal, savedFood]);

  // The categories arrive after the form opens: Cooked food from Today's
  // menu still starts in Local Delicacies (untouched forms only).
  useEffect(() => {
    if (!presetToday || !foodCategory || initial.categoryId) return;
    const withCategory = (f) => ({ ...f, categoryId: foodCategory.id });
    if (JSON.stringify(form) === JSON.stringify(initial)) setForm(withCategory);
    setInitial(withCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetToday, foodCategory?.id]);

  // After a failed check, bring the first problem into view: every invalid
  // part reports itself; the highest one wins.
  const pending = useRef([]);
  const report = useCallback((ref) => {
    pending.current.push(ref);
    if (pending.current.length > 1) return;
    setTimeout(() => {
      const refs = pending.current;
      pending.current = [];
      let best = null;
      let left = refs.length;
      const done = () => {
        left -= 1;
        if (left === 0 && best !== null) scrollRef.current?.scrollTo({ y: Math.max(0, best - 140), animated: true });
      };
      refs.forEach((r) => {
        if (!r.current || !contentRef.current) { done(); return; }
        try {
          r.current.measureLayout(contentRef.current, (x, y) => {
            best = best === null ? y : Math.min(best, y);
            done();
          }, done);
        } catch {
          done();
        }
      });
    }, 60);
  }, []);
  const invalidCtx = useMemo(() => ({ attempt, report }), [attempt, report]);

  /* ── kind ─────────────────────────────────────────────────────── */
  const originalKind = product ? productKind(product) : null;
  const optionsFor = (category) => kindOptions(category, originalKind)
    .filter((k) => k.key !== 'READY_TO_EAT' || todayOn || originalKind === 'READY_TO_EAT');
  const category = categories.find((c) => c.id === form.categoryId) || product?.category || null;
  const kindOpts = form.categoryId ? optionsFor(category) : [];
  const kind = form.kind;
  // Local Delicacies' short form: Packed food or Cooked food, on one page.
  const short = isLocalDelicacies(category) && SHORT_KINDS.includes(kind || null);
  const cooked = short && kind === 'READY_TO_EAT';
  const packed = short && kind === 'REGULAR';
  // Cooked food here is a menu item: Today's menu asks how many and when, as it is posted.
  const settle = (st) => (short ? { ...st, postToday: false } : st);
  const steps = short ? SHORT_STEPS : STEPS;
  const LAST_STEP = steps.length;
  const ctx = { kind, kindAsked: kindOpts.length > 1, hasOptions, couriersOn, editing };
  const offers = kindOffers(kind);
  const by = pricedBy(form, ctx);
  const span = priceSpan(form, ctx);
  const stockedGroup = kind === 'REGULAR' && hasOptions ? form.variations.find((g) => g.stocked && g.choices.length) : null;

  const pickPolicy = (key) => {
    setPolicyMode(key);
    if (key === 'custom') {
      if (policyModeFor(form.returnPolicy) !== 'custom') setForm((f) => ({ ...f, returnPolicy: '' }));
    } else {
      setForm((f) => ({ ...f, returnPolicy: RETURN_POLICIES.find((p) => p.key === key)?.text || '' }));
    }
  };

  const clearPolicy = () => {
    setPolicyMode(null);
    setForm((f) => ({ ...f, returnPolicy: '' }));
  };

  // Switch the kind on a copy of the form (base) and keep it.
  const applyKind = (base, next) => {
    const { form: switched, hasOptions: has } = switchKind(base, next, hasOptions);
    let out = switched;
    // Cooked food: the perishable returns rule fits, unless one is chosen.
    if (next !== form.kind && FOOD.includes(next) && !editing && !out.returnPolicy) {
      out = { ...out, returnPolicy: RETURN_POLICIES.find((p) => p.key === 'perishable').text };
      setPolicyMode('perishable');
    }
    setForm(out);
    setHasOptions(has);
  };

  const onCategory = (id) => {
    const opts = id ? optionsFor(categories.find((c) => c.id === id)) : [];
    let next = form.kind;
    if (opts.length === 1) next = opts[0].key;
    else if (!(form.kindPicked && opts.some((o) => o.key === form.kind))) next = null;
    const picked = opts.length > 1 && form.kindPicked && next === form.kind;
    applyKind({ ...form, categoryId: id, kindPicked: picked }, next);
    setErrors((e) => ({ ...e, categoryId: '', kind: '' }));
  };

  const onKind = (next) => {
    applyKind({ ...form, kindPicked: true }, next);
    setErrors((e) => ({ ...e, kind: '', price: '' }));
  };

  /* ── fields ───────────────────────────────────────────────────── */
  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  // Several fields at once; their problems are cleared.
  const patch = (fields) => {
    setForm((f) => ({ ...f, ...fields }));
    if (Object.keys(fields).some((k) => errors[k])) {
      setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(fields).map((k) => [k, ''])) }));
    }
  };

  /* ── choice groups ───────────────────────────────────────────── */
  const updateGroup = (key, change) => {
    setForm((f) => ({
      ...f,
      variations: f.variations.map((g) => (g.key === key ? { ...g, ...(typeof change === 'function' ? change(g) : change) } : g)),
    }));
    if (errors[`group-${key}`]) setErrors((e) => ({ ...e, [`group-${key}`]: '' }));
  };

  const groupActions = {
    update: updateGroup,
    add: () => {
      if (form.variations.length >= MAX_GROUPS) return;
      setForm((f) => ({ ...f, variations: [...f.variations, emptyGroup()] }));
    },
    remove: (key) => {
      if (!form.variations.some((g) => g.key !== key)) setHasOptions(false);
      setForm((f) => ({ ...f, variations: f.variations.filter((g) => g.key !== key) }));
    },
    addChoices: (key, raw) => {
      updateGroup(key, (g) => ({ choices: mergeChoices(g.choices, raw ?? g.draft), draft: raw === undefined ? '' : g.draft }));
    },
    removeChoice: (key, choice) => {
      updateGroup(key, (g) => {
        const prices = { ...g.prices };
        const stocks = { ...g.stocks };
        const images = { ...g.images };
        delete prices[choice];
        delete stocks[choice];
        delete images[choice];
        return {
          choices: g.choices.filter((c) => c !== choice), prices, stocks, images,
        };
      });
    },
    // A photo for one choice (null removes it). Only one group can carry
    // photos: a photo added here moves them off the other group.
    setPhoto: (key, choice, url) => {
      const pictured = (g) => g.choices.some((c) => g.images?.[c]);
      const other = url ? form.variations.find((g) => g.key !== key && pictured(g)) : null;
      if (other) toast.info(`Photos per choice moved from ${other.name || 'the other type'} to this one`);
      setForm((f) => ({
        ...f,
        variations: f.variations.map((g) => {
          if (g.key === key) {
            const images = { ...g.images };
            if (url) images[choice] = url;
            else delete images[choice];
            return { ...g, images };
          }
          return url && pictured(g) ? { ...g, images: {} } : g;
        }),
      }));
    },
    // Only one group can carry prices, and only one stock: switching it on
    // for one group switches it off for the others.
    toggleFlag: (key, flag) => {
      const turningOn = !form.variations.find((g) => g.key === key)?.[flag];
      const other = turningOn ? form.variations.find((g) => g.key !== key && g[flag]) : null;
      if (other) {
        const what = flag === 'priced' ? 'Prices' : 'Stock';
        toast.info(`${what} per choice moved from ${other.name || 'the other type'} to this one`);
      }
      setForm((f) => ({
        ...f,
        variations: f.variations.map((g) => {
          if (g.key === key) return { ...g, [flag]: turningOn };
          return turningOn ? { ...g, [flag]: false } : g;
        }),
      }));
      setErrors((e) => ({ ...e, price: '', stock: '', [`group-${key}`]: '' }));
    },
  };

  const chooseHasOptions = (yes) => {
    setHasOptions(yes);
    if (yes && form.variations.length === 0) setForm((f) => ({ ...f, variations: [emptyGroup()] }));
    setErrors((e) => ({ ...e, options: '' }));
  };

  const toggleRow = (row) => setOpenRows((rows) => (rows.includes(row) ? rows.filter((r) => r !== row) : [...rows, row]));
  const openWithErrors = (errs) => {
    const rows = rowsWithErrors(errs);
    if (rows.length) setOpenRows((open) => [...new Set([...open, ...rows])]);
  };

  /* ── steps ────────────────────────────────────────────────────── */
  const goStep = (n) => setStep(Math.min(LAST_STEP, Math.max(1, n)));

  // Typed but not added choices count; keep them merged in.
  const settled = () => {
    const state = withDrafts(form);
    if (state !== form) setForm(state);
    return state;
  };

  const goNext = () => {
    const state = settled();
    const key = STEPS[step - 1]?.key;
    const errs = key && key !== 'review' ? checkStep(key, state, ctx) : {};
    setErrors(errs);
    if (hasErrors(errs)) {
      toast.error('Please check the highlighted part.');
      openWithErrors(errs);
      setAttempt((n) => n + 1);
      return;
    }
    goStep(step + 1);
  };

  // Back to an earlier step; when editing, any step (saving checks them all).
  const jumpTo = (n) => {
    if (n < step || (n > step && editing)) goStep(n);
  };

  /* ── leaving ──────────────────────────────────────────────────── */
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  // Animals saved from this form reach the list as it closes.
  const leave = () => {
    if (lastSaved.current) onSaved?.(lastSaved.current, { created: true });
    else onCancel?.();
  };

  const requestCancel = () => {
    if (dirty && !saving) setConfirmLeave('cancel');
    else leave();
  };
  const requestPackage = () => {
    if (dirty) setConfirmLeave('package');
    else onPackage?.();
  };

  // The bar's Back / Cancel.
  const goBack = () => {
    if (step > 1) goStep(step - 1);
    else requestCancel();
  };

  // The top bar's back and Android's back: a step back, as the website's
  // history does; on the first step they leave (no question, as there).
  const backOut = () => {
    if (saving) return;
    if (savedAnimal) onSaved?.(savedAnimal, { created: true });
    else if (savedFood) onSaved?.(savedFood, { created: true, next: 'done' });
    else if (step > 1) goStep(step - 1);
    else leave();
  };
  const backRef = useRef(backOut);
  backRef.current = backOut;
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []));

  /* ── save ─────────────────────────────────────────────────────── */
  const save = async () => {
    if (saving) return;
    if (step < LAST_STEP) {
      goNext();
      return;
    }
    const state = settled();
    const { errors: errs, first } = checkAll(settle(state), ctx);
    setErrors(errs);
    if (first >= 0) {
      toast.error('Please check the highlighted parts.');
      openWithErrors(errs);
      if (short && (errs.salePrice || errs.priceTiers || (!couriersOn && errs.weightKg))) setMoreOpen(true);
      if (!short && first + 1 < step) goStep(first + 1);
      setAttempt((n) => n + 1);
      return;
    }

    const payload = buildPayload(settle(state), { kind, hasOptions, editing, product });
    setSaving(true);
    try {
      const res = editing
        ? await apiClient.put(`/products/${product.id}`, payload)
        : await apiClient.post('/products', payload);
      const saved = res?.data || null;
      if (saved?.todayPostError) toast.error(saved.todayPostError);
      if (!editing && kind === 'LIVESTOCK') {
        lastSaved.current = saved;
        setSavedAnimal(saved);
        return;
      }
      if (!editing && cooked && saved?.id) {
        lastSaved.current = saved;
        setSavedFood(saved);
        return;
      }
      onSaved?.(saved, { created: !editing });
    } catch (err) {
      toast.error(err.message || 'Could not save the product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // The animal's details again, for one more listing: new photos and name.
  const addAnother = () => {
    const next = { ...form, name: '', images: [], kindPicked: true };
    setForm(next);
    setInitial(next);
    setErrors({});
    setSavedAnimal(null);
    goStep(1);
  };

  /* ── what buyers will see ─────────────────────────────────────── */
  const draft = draftProduct(settle(form), ctx);
  const askWay = !shopMode || shopMode === 'BOTH';
  const wayText = WAY_TEXT[askWay ? form.fulfillment : shopMode] || 'Pickup or delivery';
  const todayQty = kind === 'READY_TO_EAT' && !editing && form.postToday ? parseInt(form.todayQty, 10) || 0 : 0;
  const kindWord = kindOpts.find((k) => k.key === kind)?.label || (kind ? kindLabel(kind) : '');
  const tiers = form.priceTiers.filter((x) => x.minQty !== '' && x.price !== '');
  const policy = RETURN_POLICIES.find((p) => p.key === policyMode);
  const choiceGroups = hasOptions && offers.choices ? form.variations.filter((g) => g.name.trim() && g.choices.length) : [];
  const sumup = [
    {
      step: 1,
      title: 'Basics',
      lines: [
        [category?.name, ctx.kindAsked && kindWord].filter(Boolean).join(' · '),
        form.description.trim() && `${form.description.trim().slice(0, 90)}${form.description.trim().length > 90 ? '…' : ''}`,
      ],
    },
    { step: 2, title: DETAIL_TITLES[kind] || 'Details', lines: [...detailLines(form, ctx), wayText] },
    {
      step: 3,
      title: STEPS[2].title,
      lines: [
        choiceGroups.length ? `Choices: ${choiceGroups.map((g) => g.name.trim()).join(', ')}` : '',
        !by && form.saleOn && Number(form.salePrice) > 0 ? `On sale at ${peso(form.salePrice)}` : '',
        !by && tiers.length ? `${tiers.length} bulk ${tiers.length === 1 ? 'price' : 'prices'}` : '',
        offers.weight && !couriersOn && form.weightKg ? `${form.weightKg} kg with packaging` : '',
        policy ? `Returns: ${policy.title}` : policyMode === 'custom' ? 'Returns: in your own words' : 'No return policy',
      ],
    },
  ];

  const priceFrom = by ? {
    span,
    text: by === 'sizes' ? 'From the sizes in Details' : 'From each choice’s price in Extras',
  } : null;

  const current = steps[Math.min(step, LAST_STEP) - 1];
  const stepTitle = (sx) => (sx.key === 'details' ? DETAIL_TITLES[kind] || 'Details' : sx.title);
  const stepHint = (sx) => {
    if (sx.key === 'details') return DETAIL_HINTS[kind] || 'Questions for what you sell.';
    if (sx.key === 'review' && editing) return 'This is how buyers will see it.';
    return STEP_HINTS[sx.key];
  };
  const saveLabel = editing ? 'Save changes' : cooked ? 'Save to my menu' : short ? 'Put on sale' : kind === 'LIVESTOCK' ? 'Add animal' : 'Add product';
  const moreSummary = [
    !couriersOn && Number(form.weightKg) > 0 && `${form.weightKg} kg with packaging`,
    !by && form.saleOn && Number(form.salePrice) > 0 && `On sale at ${peso(form.salePrice)}`,
    !by && tiers.length && 'Cheaper when buying many',
    policy ? `Returns: ${policy.title}` : policyMode === 'custom' && 'Returns: your own words',
  ].filter(Boolean).join(' · ') || (couriersOn ? 'Sale price, cheaper for many, returns' : 'Sale price, cheaper for many, returns, weight');

  let body = null;
  if (current.key === 'food') {
    body = (
      <FoodStep
        form={form}
        set={set}
        errors={errors}
        categories={categories}
        onCategory={onCategory}
        onKind={onKind}
        onPackage={requestPackage}
        onHasOptions={chooseHasOptions}
        groupActions={groupActions}
        moreOpen={moreOpen}
        onMoreToggle={() => setMoreOpen((v) => !v)}
        moreSummary={moreSummary}
        more={packed ? (
          <MoreStep
            form={form}
            set={set}
            errors={errors}
            kind={kind}
            offers={{ ...offers, choices: false }}
            by={by}
            couriersOn={couriersOn}
            open={openRows}
            onToggleRow={toggleRow}
            hasOptions={hasOptions}
            onHasOptions={chooseHasOptions}
            groupActions={groupActions}
            policyMode={policyMode}
            onPolicy={pickPolicy}
            onClearPolicy={clearPolicy}
          />
        ) : null}
        ctx={{
          kind, kindOpts, editing, couriersOn, shopMode, stockedGroup, hasOptions, offers, priceFrom,
        }}
      />
    );
  } else if (current.key === 'basics') {
    body = (
      <BasicsStep
        form={form}
        set={set}
        errors={errors}
        categories={categories}
        kind={kind}
        kindOpts={kindOpts}
        onCategory={onCategory}
        onKind={onKind}
        priceFrom={priceFrom}
        onPackage={requestPackage}
        editing={editing}
      />
    );
  } else if (current.key === 'details') {
    body = (
      <DetailsStep
        form={form}
        set={set}
        patch={patch}
        errors={errors}
        ctx={{ kind, editing, couriersOn, shopMode, stockedGroup }}
      />
    );
  } else if (current.key === 'more') {
    body = (
      <MoreStep
        form={form}
        set={set}
        errors={errors}
        kind={kind}
        offers={offers}
        by={by}
        couriersOn={couriersOn}
        open={openRows}
        onToggleRow={toggleRow}
        hasOptions={hasOptions}
        onHasOptions={chooseHasOptions}
        groupActions={groupActions}
        policyMode={policyMode}
        onPolicy={pickPolicy}
        onClearPolicy={clearPolicy}
      />
    );
  } else {
    body = <ReviewStep draft={draft} kind={kind} way={wayText} todayQty={todayQty} sections={sumup} onEdit={jumpTo} />;
  }

  if (savedFood) {
    return (
      <SellerPage scroll={false} onBack={backOut}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[sellerPageStyles.content, { paddingBottom: 24 + insets.bottom }]}
        >
          <View style={styles.done} accessibilityLiveRegion="polite">
            <CheckCircleIcon size={44} weight="fill" color={PF.green} />
            <Text style={styles.doneTitle}>Saved to your menu</Text>
            <Text style={[styles.doneText, styles.doneFacts]}>{savedFood.name} · {peso(Number(savedFood.price) || 0)}</Text>
            <Text style={styles.doneText}>Post it on Today&apos;s menu when you have it.</Text>
            <View style={styles.doneActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSaved?.(savedFood, { created: true, next: 'done' })}
                style={[styles.btn, styles.btnGhost]}
              >
                <Text style={[styles.btnText, styles.btnTextGhost]}>Done</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSaved?.(savedFood, { created: true, next: 'post' })}
                style={[styles.btn, styles.btnPrimary]}
              >
                <CalendarPlusIcon size={18} weight="bold" color="#fff" />
                <Text style={[styles.btnText, styles.btnTextPrimary]}>Post it now</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SellerPage>
    );
  }

  if (savedAnimal) {
    const unitPrice = Number(savedAnimal.price) || 0;
    return (
      <SellerPage scroll={false} onBack={backOut}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[sellerPageStyles.content, { paddingBottom: 24 + insets.bottom }]}
        >
          <View style={styles.done}>
            <CheckCircleIcon size={44} weight="fill" color={PF.green} />
            <Text style={styles.doneTitle}>{savedAnimal.name} is listed</Text>
            <Text style={[styles.doneText, styles.doneFacts]}>{headsLabel(savedAnimal.stock)} · {peso(unitPrice)} / head</Text>
            <Text style={styles.doneText}>
              Have more animals that differ, like another age, sex or weight? List each one on its own.
              We copy these details, so you only add the photos and name.
            </Text>
            <View style={styles.doneActions}>
              <Pressable accessibilityRole="button" onPress={addAnother} style={[styles.btn, styles.btnGhost]}>
                <Text style={[styles.btnText, styles.btnTextGhost]}>Add another animal like this</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSaved?.(savedAnimal, { created: true })}
                style={[styles.btn, styles.btnPrimary]}
              >
                <CheckIcon size={17} weight="bold" color="#fff" />
                <Text style={[styles.btnText, styles.btnTextPrimary]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SellerPage>
    );
  }

  return (
    <SellerPage scroll={false} onBack={backOut}>
      {/* iOS: the edge swipe would leave the form from any step; past the
          first step, back goes a step back (the top bar's arrow) instead. */}
      <Stack.Screen options={{ gestureEnabled: step === 1 && !saving }} />
      <InvalidScrollContext.Provider value={invalidCtx}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[sellerPageStyles.content, { paddingBottom: savebarSpace(insets) + 20 }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View ref={contentRef} style={styles.pf}>
            {short ? null : (
              <View style={styles.progress}>
                <Text style={styles.progressText}>Step {step} of {LAST_STEP}</Text>
                <View style={styles.progressBar}>
                  {steps.map((sx, i) => <View key={sx.key} style={[styles.progressPart, i < step && styles.progressOn]} />)}
                </View>
              </View>
            )}

            {step === 1 && sellBlockers?.length > 0 ? (
              <View style={[styles.note, styles.noteDraft]}>
                <InfoIcon size={16} color={t.warning[800]} style={styles.noteIcon} />
                <Text style={[styles.noteText, styles.noteTextDraft]}>
                  Buyers can see this product, but can&apos;t order it until your shop is ready to sell.
                  {' '}Still to do: {sellBlockers.map((b) => b.label).join(', ')}.
                </Text>
              </View>
            ) : step === 1 && editing && product.status === 'APPROVED' ? (
              <View style={styles.note}>
                <InfoIcon size={16} color={PF.greenDark} style={styles.noteIcon} />
                <Text style={styles.noteText}>This product is live. Your changes show to buyers as soon as you save.</Text>
              </View>
            ) : null}

            {short ? body : (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">{stepTitle(current)}</Text>
                  <Text style={styles.sectionHint}>{stepHint(current)}</Text>
                </View>
                <View style={styles.sectionBody}>{body}</View>
              </View>
            )}
          </View>
        </ScrollView>
      </InvalidScrollContext.Provider>

      <PhoneSaveBar>
        <PhoneSaveButton label={step > 1 ? 'Back' : 'Cancel'} onPress={goBack} disabled={saving} />
        {step < LAST_STEP ? (
          <PhoneSaveButton primary label="Next" onPress={goNext} />
        ) : (
          <PhoneSaveButton
            primary
            label={saveLabel}
            busyLabel="Saving…"
            busy={saving}
            onPress={save}
          />
        )}
      </PhoneSaveBar>

      <OrderConfirmDialog
        open={!!confirmLeave}
        title="Leave without saving?"
        message="What you entered for this product will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => {
          const to = confirmLeave;
          setConfirmLeave(null);
          if (to === 'package') onPackage?.();
          else leave();
        }}
        onCancel={() => setConfirmLeave(null)}
      />
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pf: { gap: 12, minWidth: 0 },

  progress: { gap: 8, paddingTop: 2, paddingHorizontal: 2 },
  progressText: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(600) },
  progressBar: { flexDirection: 'row', gap: 6 },
  progressPart: { flex: 1, height: 4, borderRadius: 999, backgroundColor: t.neutral[200] },
  progressOn: { backgroundColor: PF.green },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: PF.greenSoft,
  },
  noteDraft: { backgroundColor: t.warning[50] },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 19.6, color: PF.greenDark, ...font(400) },
  noteTextDraft: { color: t.warning[800] },

  // Phones: the step sits on the page, not in a card.
  section: { paddingTop: 18, paddingBottom: 8, backgroundColor: t.neutral[0] },
  sectionHead: { marginBottom: 18 },
  sectionTitle: { fontSize: 20, lineHeight: 26, color: PF.ink, ...font(600) },
  sectionHint: { marginTop: 4, fontSize: 13, lineHeight: 18.85, color: PF.muted, ...font(400) },
  sectionBody: { gap: 20, minWidth: 0 },


  done: {
    alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 28, paddingHorizontal: 18, borderRadius: 16,
    backgroundColor: t.neutral[0], boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(15, 23, 42, 0.06)' }],
  },
  doneTitle: { fontSize: 20, lineHeight: 28, color: PF.ink, textAlign: 'center', ...font(600) },
  doneText: { fontSize: 14, lineHeight: 21, color: PF.muted, textAlign: 'center', ...font(400) },
  doneFacts: { color: PF.ink, ...font(600) },
  // column-reverse on the website: Done on top, "Add another" under it.
  doneActions: { flexDirection: 'column-reverse', alignSelf: 'stretch', gap: 10, marginTop: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 24, borderRadius: 999,
  },
  btnGhost: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0] },
  btnPrimary: { backgroundColor: PF.green },
  btnText: { fontSize: 15, lineHeight: 20, ...font(600) },
  btnTextGhost: { color: t.neutral[700] },
  btnTextPrimary: { color: '#fff' },
});
