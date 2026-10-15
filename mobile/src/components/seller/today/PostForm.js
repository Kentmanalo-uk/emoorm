import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BowlFoodIcon, CalendarCheckIcon, CheckIcon, ClockIcon, CookingPotIcon, ForkKnifeIcon, LockIcon, MinusIcon, PlusIcon,
} from 'phosphor-react-native';
import apiClient from '../../../api/client';
import { toast } from '../../../lib/toast';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { isOpen, momentLabel } from '../../../lib/availability';
import { saleInfo } from '../../../lib/variantPricing';
import Glass from '../../Glass';
import { peso } from '../../SaleTag';
import { PageLoader } from '../../BrandLoader';
import SellerPage, { SellerPrivateLine } from '../SellerPage';
import { SAVEBAR_FALLBACK } from '../PhoneSaveBar';
import DayCalendar from './DayCalendar';
import { TimePanel } from './DateTimeField';
import { firstImage } from './WindowCard';
import {
  WEEKDAY_NAMES, addDays, clockText, dayTitle, manilaClock, manilaDay,
} from './todayTime';
import {
  AHEAD_DAYS, SECTIONS, KINDS, COOK_PICKS, QTY_PICKS, WEEK_PICKS, DAY_CHOICES, GET_CHOICES, LOCKED_NOTE,
  blankDraft, editDraft, againDraft, isLocked, withMode, withDays, withStartNow, toggleWeekday, pickDay, draftDays,
  moments, untilNextDay, startsNow, formErrors, daysLine, summaryLine, postLabel, batchBody, editBody, plainError,
  errorSection, plural,
} from './todayPost';

/*
 * Post an item to Today's menu, or edit one post, on one page
 * (web/src/pages/SellerTodayPost.jsx + .css; the rules are todayPost.js).
 * Every section shows at once; a bar at the bottom sums it up in one line
 * with the main button. Times are picked from half-hour chips.
 *
 * <PostForm />              a new post (app/seller/today/post.js)
 * <PostForm again={id} />   a new post filled in from an ended one
 * <PostForm product={id} /> a new post of that menu item
 * <PostForm editId={id} />  edit a post (app/seller/today/[id].js)
 */

const KIND_ICONS = { READY_NOW: BowlFoodIcon, MADE_TO_ORDER: CookingPotIcon, PRE_ORDER: CalendarCheckIcon };
const ms = (v) => new Date(v).getTime();

function Photo({ product }) {
  const [failed, setFailed] = useState(false);
  const img = firstImage(product?.images);
  if (!img || failed) {
    return <View style={[styles.photo, styles.photoEmpty]}><ForkKnifeIcon size={22} color={t.neutral[400]} /></View>;
  }
  return <Image source={{ uri: resolveImg(img) }} style={styles.photo} resizeMode="cover" onError={() => setFailed(true)} />;
}

/** A numbered section: a short title, at most one hint, the fields, and its error under them. */
function Section({
  n, title, hint, error, locked = false, first = false, onLayout, children,
}) {
  return (
    <View style={[styles.sec, !first && styles.secLine]} onLayout={onLayout}>
      <View style={styles.secHead}>
        <View style={styles.num}><Text style={styles.numText}>{n}</Text></View>
        <Text style={styles.secTitle} accessibilityRole="header">{title}</Text>
        {locked ? <LockIcon size={16} color={t.neutral[400]} accessibilityLabel="Stays the same" /> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
      {error ? <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text> : null}
    </View>
  );
}

/** Choices in one row (Today / Pick days / Every week, Same day / Next day…). */
function Seg({
  choices, value, onChange, label, small = false,
}) {
  return (
    <View style={[styles.seg, small && styles.segSmall]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {choices.map(([key, text]) => {
        const on = value === key;
        return (
          <Pressable
            key={String(key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(key)}
            style={[styles.segBtn, small && styles.segBtnSmall, on && styles.segBtnOn]}
          >
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={2}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quick picks in a row: 15 / 30 / 45 / 60 min, 10 / 20 / 30 / 50 (and "Other"). */
function Picks({
  values, value, onPick, suffix = '', label, min = 0, other = null,
}) {
  const pick = (key, text, on, onPress, off = false) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: off }}
      disabled={off}
      onPress={onPress}
      style={[styles.pick, on && styles.pickOn, off && styles.off]}
    >
      <Text style={[styles.pickText, on && styles.pickTextOn]}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={styles.picks} accessibilityLabel={label}>
      {values.map((v) => pick(v, `${v}${suffix}`, String(value) === String(v), () => onPick(v), v < min))}
      {other ? pick('other', 'Other', other.on, other.onPress) : null}
    </View>
  );
}

/** A time in a sentence: "[10:00 AM]"; tapped, the half-hour chips open under the sentence. */
function TimePill({ value, open, onPress, label }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value ? clockText(value) : 'Not set' }}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.pill, open && styles.pillOpen]}
    >
      <Text style={styles.pillText}>{value ? clockText(value) : 'Choose'}</Text>
      <ClockIcon size={16} color={open ? t.primary[600] : t.neutral[500]} />
    </Pressable>
  );
}

export default function PostForm({ editId = null, again = null, product: productId = null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState(null);
  const [storeMode, setStoreMode] = useState('BOTH');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [missing, setMissing] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [otherCook, setOtherCook] = useState(false);
  const [changeDay, setChangeDay] = useState(false);
  // "Change item": the whole list again, though an item is already chosen.
  const [changeItem, setChangeItem] = useState(false);
  const [picking, setPicking] = useState(null);
  const scrollRef = useRef(null);
  const tops = useRef({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prods, mode, post] = await Promise.all([
        apiClient.get('/products/my/products', { params: { kind: 'TODAY', pageSize: 100 } })
          .then((res) => (res.data || []).filter((p) => !['ARCHIVED', 'SUSPENDED'].includes(p.status)))
          .catch(() => []),
        apiClient.get('/stores/my/store').then((res) => res.data?.fulfillmentMode || 'DELIVERY').catch(() => 'BOTH'),
        editId || again
          ? apiClient.get('/today/mine', { params: { scope: again ? 'ended' : undefined } })
            .then((res) => (res.data?.windows || []).find((w) => w.id === (editId || again)) || null)
            .catch(() => null)
          : null,
      ]);
      if (cancelled) return;
      setProducts(prods);
      setStoreMode(mode);
      if (editId) {
        if (!post || !['LIVE', 'SCHEDULED'].includes(post.status)) { setMissing(true); return; }
        setEditing(post);
        setDraft(editDraft(post));
      } else if (post) {
        const d = againDraft(post, { products: prods, storeMode: mode });
        setDraft(d);
        setOtherCook(d.prepMinutes !== '' && !COOK_PICKS.includes(Number(d.prepMinutes)));
      } else {
        // product=<id>: Post on a menu item picks it.
        const d = blankDraft({ products: prods, storeMode: mode });
        if (productId && prods.some((p) => p.id === productId)) d.productId = productId;
        setDraft(d);
      }
    })();
    return () => { cancelled = true; };
  }, [editId, again, productId]);

  // Editing, the post's own product comes first (and is the only one once buyers ordered it).
  const list = useMemo(() => {
    if (!products) return [];
    if (!editing) return products;
    const own = products.find((p) => p.id === editing.productId)
      || { ...editing.product, id: editing.productId, name: editing.product?.name || 'Item' };
    if (editing.soldCount > 0) return [own];
    return [own, ...products.filter((p) => p.id !== editing.productId)];
  }, [products, editing]);

  const title = editId ? 'Edit post' : 'Post an item';
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/seller/today'));

  if (missing) {
    return (
      <SellerPage title={title}>
        <View style={styles.missing}>
          <Text style={styles.hint}>This post has ended or was removed, so it can&apos;t be changed.</Text>
          <Pressable accessibilityRole="button" onPress={leave} style={styles.go}>
            <Text style={styles.goText}>Back to Today&apos;s menu</Text>
          </Pressable>
        </View>
      </SellerPage>
    );
  }
  if (!draft || !products) {
    return (
      <SellerPage title={title}>
        <PageLoader label="Loading" />
      </SellerPage>
    );
  }

  const set = (patch) => {
    setDraft((d) => (typeof patch === 'function' ? patch(d) : { ...d, ...patch }));
    setServerError(null);
  };

  const locked = isLocked(draft);
  const errors = formErrors(draft);
  const errorOf = (section) => {
    if (serverError?.section === section) return serverError.text;
    const e = errors[section];
    return e && (!e.empty || tried) ? e.text : null;
  };
  const today = manilaDay(Date.now());
  const lastDay = addDays(today, AHEAD_DAYS - 1);
  const m = moments(draft);
  const days = draftDays(draft);
  const showGet = storeMode === 'BOTH';
  const barSpace = 112 + insets.bottom;
  const shown = SECTIONS.filter((s) => s !== 'get' || showGet);
  const num = (key) => shown.indexOf(key) + 1;
  const at = (key) => (e) => { tops.current[key] = e.nativeEvent.layout; };

  // After the error has rendered: the section from its title, or, when it is
  // taller than the room above the bar, its bottom (where the error is).
  const scrollTo = (section) => setTimeout(() => {
    const box = tops.current[section];
    if (!box) return;
    const room = (tops.current.view || 600) - barSpace;
    const y = box.height > room - 16 ? box.y + box.height - room + 16 : box.y - 8;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, 80);

  const posted = (windows) => {
    if (windows.length > 1) {
      const first = dayTitle(manilaDay(ms(windows[0].ordersOpenAt)));
      return `Posted for ${windows.length} days, starting ${['Today', 'Tomorrow'].includes(first) ? first.toLowerCase() : first}`;
    }
    if (windows[0]) return isOpen(windows[0]) ? 'Posted: buyers can order now' : `Posted for ${momentLabel(windows[0].ordersOpenAt)}`;
    return 'Posted';
  };

  const submit = async () => {
    setTried(true);
    setPicking(null);
    const first = SECTIONS.find((s) => errors[s]);
    if (first) { scrollTo(first); return; }
    setSaving(true);
    try {
      if (draft.edit) {
        await apiClient.patch(`/today/${draft.edit.id}`, editBody(draft));
        toast.success('Saved');
      } else {
        const res = await apiClient.post('/today/batch', batchBody(draft));
        toast.success(posted(res.data?.windows || []));
      }
      leave();
    } catch (err) {
      const raw = err.message || 'That did not work. Please try again.';
      const section = errorSection(raw) || 'end';
      setServerError({ section, text: plainError(raw) });
      scrollTo(section);
    } finally {
      setSaving(false);
    }
  };

  const togglePick = (key) => setPicking((p) => (p === key ? null : key));
  const panel = (keys) => (keys.includes(picking) ? (
    <TimePanel
      key={picking}
      value={draft[picking]}
      onChange={(v) => set({ [picking]: v, ...(picking === 'open' || picking === 'close' ? { timesSet: true } : {}) })}
      onDone={() => setPicking(null)}
    />
  ) : null);

  /* ── 1. Item ─────────────────────────────────────────────────── */
  // An item already chosen (Post on a menu item, editing, Post again, a shop
  // with one item, or one just tapped) shows alone; "Change item" opens the
  // list again, unless buyers already ordered this post.
  const chosen = list.find((p) => p.id === draft.productId);
  const canChange = !locked && list.length > 1;
  const showOne = Boolean(chosen) && (!changeItem || !canChange);
  const itemText = (p) => (
    <View style={styles.productText}>
      <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
      {p.price != null ? <Text style={styles.productPrice}>{peso(saleInfo(p).price)}</Text> : null}
    </View>
  );
  const itemSection = (
    <Section first n={num('item')} title="Item" error={errorOf('item')} onLayout={at('item')}>
      {locked ? (
        <View style={styles.locked}>
          <LockIcon size={16} weight="bold" color={t.warning[800]} />
          <Text style={styles.lockedText}>{LOCKED_NOTE}</Text>
        </View>
      ) : null}
      {list.length === 0 ? (
        <Text style={styles.hint}>
          Add items to your menu first.{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => router.push('/seller/today?tab=menu')}>Go to Menu</Text>
        </Text>
      ) : null}
      {list.length > 0 && showOne ? (
        <View style={[styles.product, styles.productOn]}>
          <Photo product={chosen} />
          {itemText(chosen)}
          {canChange ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={() => setChangeItem(true)} hitSlop={8} style={styles.change}>
              <Text style={[styles.link, styles.changeText]}>Change item</Text>
            </Pressable>
          ) : <View style={styles.tick}><CheckIcon size={12} weight="bold" color="#fff" /></View>}
        </View>
      ) : null}
      {list.length > 0 && !showOne ? (
        <View style={styles.products} accessibilityRole="radiogroup" accessibilityLabel="Item">
          {list.map((p) => {
            const on = draft.productId === p.id;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => { set({ productId: p.id }); setChangeItem(false); }}
                style={[styles.product, on && styles.productOn]}
              >
                <Photo product={p} />
                {itemText(p)}
                {on ? <View style={styles.tick}><CheckIcon size={12} weight="bold" color="#fff" /></View> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Section>
  );

  /* ── 2. Is it ready now? ─────────────────────────────────────── */
  const cookOther = otherCook || (draft.prepMinutes !== '' && !COOK_PICKS.includes(Number(draft.prepMinutes)));
  const readySection = (
    <Section n={num('ready')} title="Is it ready now?" locked={locked} error={errorOf('ready')} onLayout={at('ready')}>
      <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="Is it ready now?">
        {KINDS.filter((k) => !locked || k.key === draft.mode).map((k) => {
          const Icon = KIND_ICONS[k.key];
          const on = draft.mode === k.key;
          return (
            <Pressable
              key={k.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: locked }}
              disabled={locked}
              onPress={() => set((d) => withMode(d, k.key))}
              style={[styles.kind, on && styles.kindOn]}
            >
              <Icon size={22} color={on ? t.primary[700] : t.neutral[500]} />
              <View style={styles.kindText}>
                <Text style={styles.kindTitle}>{k.title}</Text>
                <Text style={styles.kindHint}>{k.hint}</Text>
              </View>
              {on ? <CheckIcon size={18} weight="bold" color={t.primary[700]} /> : null}
            </Pressable>
          );
        })}
      </View>
      {draft.mode === 'MADE_TO_ORDER' ? (
        <View style={styles.sub}>
          <Text style={styles.label}>Minutes to cook</Text>
          {locked ? (
            <Text style={styles.fixed}>{draft.prepMinutes} minutes</Text>
          ) : (
            <>
              <Picks
                values={COOK_PICKS}
                value={cookOther ? '' : draft.prepMinutes}
                onPick={(v) => { setOtherCook(false); set({ prepMinutes: String(v) }); }}
                label="Minutes to cook"
                other={{ on: cookOther, onPress: () => { setOtherCook(true); set({ prepMinutes: '' }); } }}
              />
              {cookOther ? (
                <View style={styles.inline}>
                  <TextInput
                    value={draft.prepMinutes}
                    onChangeText={(v) => set({ prepMinutes: v.replace(/[^0-9]/g, '') })}
                    keyboardType="number-pad"
                    placeholder="90"
                    placeholderTextColor={t.neutral[400]}
                    accessibilityLabel="Minutes to cook"
                    style={styles.inlineInput}
                  />
                  <Text style={styles.inlineText}>minutes</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </Section>
  );

  /* ── 3. How many ─────────────────────────────────────────────── */
  const qtyNum = Number(draft.quantity) || 0;
  const minQty = Math.max(1, draft.edit?.sold || 0);
  const lessOff = qtyNum <= minQty;
  const qtySection = (
    <Section
      n={num('qty')}
      title={draft.edit ? 'How many to sell' : 'How many each day'}
      hint={draft.edit?.sold ? `Buyers already ordered ${draft.edit.sold}.` : null}
      error={errorOf('qty')}
      onLayout={at('qty')}
    >
      <View style={styles.stepper} accessibilityLabel="How many">
        <Pressable accessibilityRole="button" accessibilityLabel="One less" disabled={lessOff} onPress={() => set({ quantity: String(Math.max(minQty, qtyNum - 1)) })} style={styles.stepBtn}>
          <MinusIcon size={24} weight="bold" color={lessOff ? t.neutral[300] : t.primary[700]} />
        </Pressable>
        <TextInput
          value={draft.quantity}
          onChangeText={(v) => set({ quantity: v.replace(/[^0-9]/g, '') })}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={t.neutral[400]}
          accessibilityLabel="How many"
          style={styles.stepInput}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="One more" onPress={() => set({ quantity: String(Math.max(minQty, qtyNum + 1)) })} style={styles.stepBtn}>
          <PlusIcon size={24} weight="bold" color={t.primary[700]} />
        </Pressable>
      </View>
      <Picks values={QTY_PICKS} value={draft.quantity} onPick={(v) => set({ quantity: String(v) })} label="Quick picks" min={minQty} />
    </Section>
  );

  /* ── 4. When ─────────────────────────────────────────────────── */
  const fixedOpen = (m.keepsOpen && locked) || startsNow(draft);
  const whenSection = (
    <Section n={num('when')} title="When" locked={locked} error={errorOf('when')} onLayout={at('when')}>
      {draft.edit ? (
        <View style={styles.day}>
          <Text style={styles.dayText}>Day: <Text style={styles.strong}>{daysLine(draft)}</Text></Text>
          {!locked ? (
            <Text style={styles.link} accessibilityRole="button" onPress={() => setChangeDay((c) => !c)}>
              {changeDay ? 'Done' : 'Change day'}
            </Text>
          ) : null}
        </View>
      ) : (
        <Seg choices={DAY_CHOICES.map((c) => [c.key, c.title])} value={draft.days} onChange={(v) => set((d) => withDays(d, v))} label="Which days" />
      )}

      {draft.edit && changeDay && !locked ? (
        <DayCalendar value={draft.picked} onToggle={(day) => set((d) => pickDay(d, day))} min={today} max={lastDay} today={today} label="Which day" />
      ) : null}

      {!draft.edit && draft.days === 'today' ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.startNow }}
          onPress={() => set((d) => withStartNow(d, !d.startNow))}
          style={styles.check}
        >
          <View style={[styles.box, draft.startNow && styles.boxOn]}>
            {draft.startNow ? <CheckIcon size={14} weight="bold" color="#fff" /> : null}
          </View>
          <Text style={styles.checkText}>Start now</Text>
        </Pressable>
      ) : null}

      {!draft.edit && draft.days === 'pick' ? (
        <>
          <DayCalendar value={draft.picked} onToggle={(day) => set((d) => pickDay(d, day))} min={today} max={lastDay} today={today} label="Pick days" />
          {draft.picked.length ? (
            <View style={styles.pickedRow} accessibilityLiveRegion="polite">
              <Text style={styles.picked}>{plural(draft.picked.length, 'day')} picked</Text>
              <Text style={styles.link} accessibilityRole="button" onPress={() => set({ picked: [] })}>Clear</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {!draft.edit && draft.days === 'weekly' ? (
        <>
          <View style={styles.weekdays} accessibilityLabel="Days of the week">
            {WEEKDAY_NAMES.map((w, i) => {
              const on = draft.weekdays.includes(i);
              return (
                <Pressable key={w} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => set((d) => toggleWeekday(d, i))} style={[styles.weekday, on && styles.weekdayOn]}>
                  <Text style={[styles.weekdayText, on && styles.weekdayTextOn]}>{w}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <Text style={styles.sentenceText}>For</Text>
            <Seg small choices={WEEK_PICKS.map((k) => [k, plural(k, 'week')])} value={draft.weeks} onChange={(k) => set({ weeks: k })} label="For how many weeks" />
          </View>
          {days.length ? <Text style={styles.preview} accessibilityLiveRegion="polite">{daysLine(draft)}</Text> : null}
        </>
      ) : null}

      <View style={styles.sentence}>
        <Text style={styles.sentenceText}>Buyers can order from</Text>
        <View style={styles.times}>
          {fixedOpen ? (
            <View style={styles.fixedTime}><Text style={styles.pillText}>{startsNow(draft) ? 'now' : clockText(manilaClock(m.openAt))}</Text></View>
          ) : (
            <TimePill value={draft.open} open={picking === 'open'} onPress={() => togglePick('open')} label="Orders open at" />
          )}
          <Text style={styles.sentenceText}>until</Text>
          <TimePill value={draft.close} open={picking === 'close'} onPress={() => togglePick('close')} label={m.closeNextDay ? 'Orders close at, next day' : 'Orders close at'} />
        </View>
        {m.closeNextDay ? <Text style={styles.next}>(next day)</Text> : null}
      </View>
      {panel(['open', 'close'])}

      {draft.mode === 'PRE_ORDER' ? (
        <>
          <View style={styles.sentence}>
            <View style={styles.times}>
              <Text style={styles.sentenceText}>Ready on</Text>
              <Seg small choices={[[false, 'Same day'], [true, 'Next day']]} value={draft.readyNextDay} onChange={(v) => set({ readyNextDay: v })} label="Ready on" />
            </View>
            <View style={styles.times}>
              <TimePill value={draft.readyFrom} open={picking === 'readyFrom'} onPress={() => togglePick('readyFrom')} label="Ready from" />
              <Text style={styles.sentenceText}>until</Text>
              <TimePill value={draft.readyUntil} open={picking === 'readyUntil'} onPress={() => togglePick('readyUntil')} label="Ready until" />
            </View>
            {untilNextDay(draft) ? <Text style={styles.next}>(next day)</Text> : null}
          </View>
          {panel(['readyFrom', 'readyUntil'])}
        </>
      ) : null}
    </Section>
  );

  /* ── 5. How buyers get it (only when the shop does both) ─────── */
  const getSection = showGet ? (
    <Section n={num('get')} title="How buyers get it" error={errorOf('get')} onLayout={at('get')}>
      <Seg choices={GET_CHOICES.map((c) => [c.key, c.title])} value={draft.fulfillment} onChange={(v) => set({ fulfillment: v })} label="How buyers get it" />
    </Section>
  ) : null;

  /* ── 6. Note ─────────────────────────────────────────────────── */
  const noteSection = (
    <Section n={num('note')} title="Note for buyers (optional)" onLayout={at('note')}>
      <TextInput
        value={draft.note}
        maxLength={200}
        onChangeText={(v) => set({ note: v })}
        placeholder="e.g. Best eaten warm"
        placeholderTextColor={t.neutral[400]}
        accessibilityLabel="Note for buyers"
        style={styles.input}
      />
    </Section>
  );

  const summary = summaryLine(draft);

  return (
    <SellerPage title={title} scroll={false} privateLine={false}>
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => { tops.current.view = e.nativeEvent.layout.height; }}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: barSpace + 8 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <SellerPrivateLine />
        {itemSection}
        {readySection}
        {qtySection}
        {whenSection}
        {getSection}
        {noteSection}
        <View onLayout={at('end')}>
          {serverError?.section === 'end' ? <Text style={styles.error} accessibilityRole="alert">{serverError.text}</Text> : null}
        </View>
      </ScrollView>

      <Glass fallbackStyle={SAVEBAR_FALLBACK} style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
        <Text style={styles.summary} numberOfLines={2} accessibilityLiveRegion="polite">{summary || 'Fill in the form, then post.'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          disabled={saving}
          onPress={submit}
          style={({ pressed }) => [styles.go, (pressed || saving) && styles.goPressed]}
        >
          <Text style={styles.goText} numberOfLines={1}>{saving ? (draft.edit ? 'Saving…' : 'Posting…') : postLabel(draft)}</Text>
        </Pressable>
      </Glass>
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4, paddingHorizontal: 16 },
  off: { opacity: 0.4 },
  missing: { gap: 16, paddingTop: 12 },

  // .tpp-sec
  sec: { gap: 14, paddingVertical: 22 },
  secLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  numText: { fontSize: 14, lineHeight: 18, ...font(600), color: t.neutral[600] },
  secTitle: { flexShrink: 1, fontSize: 17, lineHeight: 22, ...font(600), color: t.neutral[900] },
  hint: { marginTop: -6, fontSize: 15, lineHeight: 21.75, ...font(400), color: t.neutral[600] },
  error: { fontSize: 15, lineHeight: 21.75, ...font(500), color: t.danger[600] },
  locked: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lockedText: { flex: 1, fontSize: 15, lineHeight: 21.75, ...font(400), color: t.warning[800] },
  label: { fontSize: 15, lineHeight: 20, ...font(400), color: t.neutral[600] },
  fixed: { fontSize: 16, lineHeight: 22, ...font(600), color: t.neutral[900] },
  link: { fontSize: 15, lineHeight: 21, ...font(600), color: t.primary[700] },
  strong: { ...font(600), color: t.neutral[900] },

  // 1. Item: a photo and the whole name, one card per row
  products: { gap: 8 },
  product: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 6, paddingLeft: 6, paddingRight: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[0],
  },
  productOn: { borderColor: t.primary[600], borderWidth: 1.5, backgroundColor: t.primary[50] },
  productText: { flex: 1, minWidth: 0, gap: 2 },
  productName: { fontSize: 15, lineHeight: 19.5, ...font(500), color: t.neutral[900] },
  productPrice: { fontSize: 14, lineHeight: 18, ...font(400), color: t.neutral[600] },
  change: { flexShrink: 0, minHeight: 36, justifyContent: 'center' },
  changeText: { fontSize: 14, lineHeight: 19 },
  tick: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  photo: { width: 56, height: 56, borderRadius: 10, backgroundColor: t.neutral[100] },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },

  // 2. Is it ready now?
  kinds: { gap: 8 },
  kind: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[0],
  },
  kindOn: { borderColor: t.primary[600], borderWidth: 1.5, backgroundColor: t.primary[50] },
  kindText: { flex: 1, minWidth: 0, gap: 2 },
  kindTitle: { fontSize: 16, lineHeight: 22, ...font(600), color: t.neutral[900] },
  kindHint: { fontSize: 14, lineHeight: 19, ...font(400), color: t.neutral[600] },
  sub: { gap: 10, paddingLeft: 4 },

  picks: { flexDirection: 'row', gap: 8 },
  pick: {
    flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  pickOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  pickText: { fontSize: 16, lineHeight: 22, ...font(500), color: t.neutral[800] },
  pickTextOn: { color: '#fff' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineInput: {
    width: 110, minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 12,
    fontSize: 18, ...font(400), color: t.neutral[900], backgroundColor: t.neutral[0],
  },
  inlineText: { fontSize: 16, lineHeight: 22, ...font(400), color: t.neutral[600] },

  // 3. How many
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  stepInput: {
    flex: 1, minWidth: 0, height: 64, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 16,
    fontSize: 32, ...font(600), color: t.neutral[900], textAlign: 'center', backgroundColor: t.neutral[0],
  },

  // Choices in one row
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: t.neutral[100] },
  segSmall: { alignSelf: 'flex-start', borderRadius: 12 },
  segBtn: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segBtnSmall: {
    flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 40, paddingHorizontal: 12,
  },
  segBtnOn: {
    backgroundColor: t.neutral[0],
    shadowColor: '#111827', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  segText: { fontSize: 14, lineHeight: 18, ...font(400), color: t.neutral[700], textAlign: 'center' },
  segTextOn: { ...font(600), color: t.primary[700] },

  // 4. When
  day: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 4 },
  dayText: { fontSize: 16, lineHeight: 22, ...font(400), color: t.neutral[800] },
  check: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 10, minHeight: 44, paddingHorizontal: 4 },
  box: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: t.neutral[400], alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  checkText: { fontSize: 16, lineHeight: 22, ...font(400), color: t.neutral[900] },
  pickedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  picked: { fontSize: 15, lineHeight: 21.75, ...font(600), color: t.neutral[900] },
  preview: { fontSize: 15, lineHeight: 21.75, ...font(400), color: t.neutral[600] },
  weekdays: { flexDirection: 'row', gap: 6 },
  weekday: {
    flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  weekdayOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  weekdayText: { fontSize: 14, lineHeight: 18, ...font(400), color: t.neutral[700] },
  weekdayTextOn: { ...font(600), color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },

  // "Buyers can order from [10:00 AM] until [2:00 PM]"
  sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 8, marginTop: 4 },
  times: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sentenceText: { fontSize: 17, lineHeight: 23.8, ...font(400), color: t.neutral[800] },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  pillOpen: { borderColor: t.primary[600] },
  pillText: { fontSize: 17, lineHeight: 22, ...font(600), color: t.neutral[900] },
  fixedTime: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.neutral[100] },
  next: { fontSize: 15, lineHeight: 21, ...font(600), color: t.warning[700] },

  input: {
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 12,
    backgroundColor: t.neutral[0], fontSize: 16, ...font(400), color: t.neutral[900],
  },

  // The bar: one line of summary and the main button.
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 60, gap: 8, paddingTop: 10, paddingHorizontal: 16 },
  summary: { fontSize: 14, lineHeight: 19, ...font(500), color: t.neutral[800], textAlign: 'center' },
  go: {
    minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.primary[600],
  },
  goPressed: { opacity: 0.8 },
  goText: { fontSize: 16, lineHeight: 22, ...font(600), color: '#fff' },
});
