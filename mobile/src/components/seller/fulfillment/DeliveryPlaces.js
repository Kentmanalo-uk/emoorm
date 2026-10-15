import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  CaretDownIcon, CheckIcon, DotsThreeIcon, GiftIcon, MagnifyingGlassIcon, MapPinIcon, PathIcon, PlusIcon, TagIcon, WarningIcon,
} from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { useReveal } from '../../ScrollReveal';
import { SERVICE_MUNICIPALITIES, listBarangays, normalizeName } from '../../checkout/CheckoutAddressPicker';
import {
  MAX_FEE, QUICK_FEES, brgyKey, brgyLabel, distanceFeeAt, distanceProblems, distanceRate, feeLabel,
  fillMissingFees, isWhole, parseFee, pesos, placeTitle, plural, putAllTowns, putPlace, removePlace, setAllFees,
  sortPlaces, unpricedPlaces, wholeTown,
} from './deliveryPlan';

/*
 * "Delivery places and fees" (web components/seller/delivery/DeliveryPlaces.jsx),
 * on the screen itself (no sheets, no steps): at the top the way to charge,
 * [Free delivery], [Fee per place] or [By distance] (its numbers right under
 * it); fees typed per place are kept while delivery is free or by distance. Then one
 * line per place with its fee right next to it, typed in place (saved on
 * Done, when the box is left, or a moment after typing stops) or set Free
 * with one tap; the ⋯ on a line holds "Change barangays" and "Remove". "+ Add
 * a place" opens one small form: town, all of it or some barangays, the fee,
 * [Add]. One panel at a time; a panel scrolls itself into sight
 * (ScrollReveal) and takes focus; closing gives focus back to what opened it.
 *
 * Every change goes to onCommit(nextPlan, message): the Delivery screen
 * saves it at once (message false: no toast, the line shows a small
 * "Saved"), the guided setup keeps it until "Save and continue".
 */

const ELEV_CARD = '0px 6px 18px rgba(149, 157, 165, 0.08)';
const web = Platform.OS === 'web';
// A heading focus can be moved to (the website's tabIndex -1).
const FOCUSABLE_HEADING = web ? { tabIndex: -1 } : {};

/** Move keyboard (web) or screen-reader (phones) focus to a view. */
const focusNode = (node) => {
  if (!node) return;
  if (web) node.focus?.({ preventScroll: true });
  else AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus');
};

/**
 * The one inline panel open in the section: { kind, place }. open(next,
 * from): `from` names what opened it (a view registered with reg(key));
 * focus goes back there when the panel closes, or to "Add a place".
 */
export function useInlinePanel() {
  const [panel, setPanel] = useState(null);
  const from = useRef(null);
  const nodes = useRef(new Map());
  const reg = useCallback((key) => (node) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);
  const open = useCallback((next, trigger) => {
    from.current = trigger || null;
    setPanel(next);
  }, []);
  const close = useCallback(() => setPanel(null), []);
  const focus = useCallback((key) => {
    setTimeout(() => focusNode(nodes.current.get(key) || nodes.current.get('add') || nodes.current.get('title')), 60);
  }, []);
  useEffect(() => {
    if (panel || !from.current) return;
    const key = from.current;
    from.current = null;
    focus(key);
  }, [panel, focus]);
  return {
    panel, open, close, reg, focus,
  };
}

export default function DeliveryPlaces({
  plan, onCommit, municipalities, homeId, platformRate, distanceExtras = null, distanceNote = null,
  allowDistance = true, showHead = true,
}) {
  const nameOf = (id) => municipalities.find((m) => m.id === id)?.name || '';
  const homeName = nameOf(homeId) || 'your town';
  const {
    panel, open, close, reg,
  } = useInlinePanel();
  const [busy, setBusy] = useState(false);
  // "By distance" picked but not saved yet (its numbers still to fill in).
  const [wantDistance, setWantDistance] = useState(false);
  const charging = plan.distance ? 'distance' : plan.free ? 'free' : 'places';

  // Saves one after another, each from the list as the last one left it.
  const latest = useRef(plan);
  const queue = useRef(Promise.resolve());
  useEffect(() => { latest.current = plan; }, [plan]);
  const commitFrom = (build, message) => {
    const run = queue.current.then(async () => {
      const next = build(latest.current);
      if (!next) return true;
      setBusy(true);
      try {
        await onCommit(next, message);
        latest.current = next;
        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    });
    queue.current = run.catch(() => {});
    return run;
  };
  const save = async (next, message) => {
    const ok = await commitFrom(() => next, message);
    if (ok) close();
    return ok;
  };
  const saveFee = (place, fee) => commitFrom((cur) => {
    const p = cur.places.find((x) => x.key === place.key);
    if (!p || (p.fee != null && Number(p.fee) === fee)) return null;
    return putPlace(cur, { ...p, fee }, p.key);
  }, false);

  const places = sortPlaces(plan.places, homeId, nameOf);
  const asksFees = panel?.kind === 'missing';
  const view = asksFees ? 'places' : (allowDistance && (plan.distance || wantDistance)) ? 'distance' : charging;
  const adding = panel?.kind === 'add' || panel?.kind === 'home';

  // Free saves at once; by distance once its numbers are in. Back to fees
  // per place: places added meanwhile need a fee first.
  const choose = (mode) => {
    if (busy || mode === view) return;
    close();
    if (mode === 'distance') {
      setWantDistance(true);
      return;
    }
    setWantDistance(false);
    if (mode === 'free') {
      if (!plan.free) commitFrom((cur) => ({ ...cur, free: true, distance: false }), 'Free delivery is on');
      return;
    }
    if (charging === 'places') return;
    if (unpricedPlaces(plan).length) {
      open({ kind: 'missing' }, `mode-${charging}`);
      return;
    }
    commitFrom((cur) => ({ ...cur, free: false, distance: false }), 'Fees per place are on again');
  };

  return (
    <View style={styles.wrap}>
      {showHead ? (
        <Text ref={reg('title')} style={styles.title} accessibilityRole="header" {...FOCUSABLE_HEADING}>Delivery places and fees</Text>
      ) : null}

      <FeeMode value={view} onChange={choose} reg={reg} allowDistance={allowDistance} />

      {asksFees ? (
        <MissingFees
          count={unpricedPlaces(plan).length}
          onClose={close}
          onSave={(fee) => save({ ...fillMissingFees(plan, fee), distance: false, free: false }, 'Fees per place are on again')}
        />
      ) : null}

      {view === 'distance' ? (
        <DistanceFields
          key={`${plan.distance}:${JSON.stringify(plan.perKm)}`}
          plan={plan}
          platformRate={platformRate}
          extras={distanceExtras}
          note={distanceNote}
          busy={busy}
          onSave={(perKm) => commitFrom((cur) => ({
            ...cur, distance: true, free: false, perKm,
          }), plan.distance ? 'Distance fee saved' : 'Now charging by distance')}
        />
      ) : null}

      {!places.length && !adding ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No places yet</Text>
          <BigButton primary label={`Deliver only in ${homeName}`} Icon={MapPinIcon} onPress={() => open({ kind: 'home' }, 'home')} />
          <BigButton label="Choose places" Icon={PlusIcon} onPress={() => open({ kind: 'add' }, 'choose')} />
        </View>
      ) : (
        <>
          {view === 'places' && charging === 'places' && places.length > 1 ? (
            <SameFee busy={busy} onApply={(fee) => commitFrom((cur) => setAllFees(cur, fee), `Every place: ${fee === 0 ? 'free delivery' : pesos(fee)}`)} />
          ) : null}
          {view !== 'places' && places.length ? <Text style={styles.subTitle} accessibilityRole="header">Places you deliver to</Text> : null}
          <PlaceList
            places={places}
            plan={plan}
            nameOf={nameOf}
            homeId={homeId}
            municipalities={municipalities}
            busy={busy}
            feeMode={view === 'distance' ? 'hidden' : view === 'free' ? 'free' : 'edit'}
            panel={panel}
            onOpen={open}
            onClose={close}
            onSave={save}
            onFee={saveFee}
            onRemove={(place) => commitFrom((cur) => removePlace(cur, place.key), `Removed ${placeTitle(place, nameOf).title}`)}
            reg={reg}
          />
        </>
      )}
    </View>
  );
}

const MODES = [
  {
    key: 'free', label: 'Free delivery', hint: 'Buyers pay nothing', Icon: GiftIcon,
  },
  {
    key: 'places', label: 'Fee per place', hint: 'Per town or barangay', Icon: TagIcon,
  },
  {
    key: 'distance', label: 'By distance', hint: 'Goes up per km', Icon: PathIcon,
  },
];

/** [Free delivery] [Fee per place] [By distance]: big, the one in use filled green. */
function FeeMode({
  value, onChange, reg, allowDistance = true,
}) {
  const three = allowDistance;
  return (
    <View style={styles.mode} accessibilityLabel="How buyers pay for delivery">
      {MODES.filter((m) => allowDistance || m.key !== 'distance').map(({
        key, label, hint, Icon,
      }) => {
        const on = value === key;
        return (
          <Pressable
            key={key}
            ref={reg(`mode-${key}`)}
            accessibilityRole="button"
            accessibilityLabel={`${label}. ${hint}`}
            accessibilityState={web ? undefined : { selected: on }}
            {...(web ? { 'aria-pressed': on } : {})}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.modeOpt, three && styles.modeOpt3, on && styles.modeOptOn, pressed && !on && styles.modeOptPressed]}
          >
            <View style={styles.modeTop}>
              <Icon size={22} weight="fill" color={on ? '#fff' : t.primary[600]} />
              <View style={[styles.modeTick, on && styles.modeTickOn]}>
                {on ? <CheckIcon size={13} weight="bold" color={t.primary[600]} /> : null}
              </View>
            </View>
            <Text style={[styles.modeLabel, three && styles.modeLabel3, on && styles.modeLabelOn]}>{label}</Text>
            <Text style={[styles.modeHint, three && styles.modeHint3, on && styles.modeHintOn]}>{hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BigButton({
  label, Icon, onPress, primary = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.big, primary && styles.bigPrimary, pressed && styles.pressed]}
    >
      {Icon ? <Icon size={18} weight={primary ? 'fill' : 'bold'} color={primary ? '#fff' : t.neutral[800]} /> : null}
      <Text style={[styles.bigText, primary && styles.bigTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

/** "+ Add a place": the dashed button under the list. */
export function AddButton({ onPress, buttonRef }) {
  return (
    <Pressable ref={buttonRef} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.add, pressed && styles.addPressed]}>
      <PlusIcon size={18} weight="bold" color={t.primary[700]} />
      <Text style={styles.addText}>Add a place</Text>
    </Pressable>
  );
}

/** "What buyers pay", in sentences (the guided setup's "all set" screen). */
export function PlacesSummary({ lines }) {
  if (!lines.length) return null;
  return (
    <View style={styles.summary} accessibilityLiveRegion="polite">
      <Text style={styles.summaryTitle}>What buyers pay</Text>
      {lines.map((line) => <Text key={line} style={styles.summaryLine}>{line}</Text>)}
    </View>
  );
}

/** "Same fee for all [₱ ] [Apply to all]", above the list. */
function SameFee({ busy, onApply }) {
  const [text, setText] = useState('');
  const fee = parseFee(text);
  const bad = text.trim() !== '' && fee === undefined;
  const ready = fee != null && fee !== undefined && !busy;
  const apply = async () => {
    if (!ready) return;
    await onApply(fee);
    setText('');
  };
  return (
    <View style={styles.sameFee}>
      <Text style={styles.sameFeeLabel}>Same fee for all</Text>
      <View style={[styles.box, styles.boxSmall, bad && styles.boxBad]}>
        <Text style={styles.peso}>₱</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={apply}
          placeholder="Fee"
          placeholderTextColor={t.neutral[400]}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel="Same fee for all"
          style={styles.boxInput}
        />
      </View>
      <SmallButton label="Apply to all" onPress={apply} disabled={!ready} />
    </View>
  );
}

/**
 * The places, one line each with its fee right next to it (a town with
 * barangays of their own under a small town heading), then "+ Add a place".
 * The ⋯ on a line opens "Change barangays" and "Remove" under it. The panel
 * state is the caller's (useInlinePanel), so only one is open.
 * feeMode: 'edit' (fee boxes), 'free' ("Free" on every line), 'hidden'.
 */
export function PlaceList({
  places, plan, nameOf, homeId, municipalities, panel, onOpen, onClose, onSave, onFee, onRemove, reg, busy = false,
  feeMode = plan.distance ? 'hidden' : plan.free ? 'free' : 'edit',
}) {
  const adding = panel?.kind === 'add' || panel?.kind === 'home';
  const formProps = {
    plan, municipalities, homeId, onClose, onSave,
  };
  const towns = [];
  for (const p of places) {
    const last = towns[towns.length - 1];
    if (last && last.id === p.municipalityId) last.places.push(p);
    else towns.push({ id: p.municipalityId, places: [p] });
  }
  const row = (p, headed) => {
    const { title } = placeTitle(p, nameOf);
    const shown = headed && !isWhole(p) ? brgyLabel(p.barangays[0]) : title;
    const mine = panel?.place?.key === p.key ? panel.kind : null;
    const home = p.municipalityId === homeId && isWhole(p);
    return (
      <View key={p.key} style={[styles.row, mine === 'edit' && styles.rowOpen]}>
        <View style={styles.rowTop}>
          <MapPinIcon size={20} weight="fill" color={t.primary[600]} />
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{shown}</Text>
            {p.barangays.length > 1 ? <Text style={styles.rowDetail}>{p.barangays.join(', ')}</Text> : null}
            {home ? <View style={styles.tags}><Text style={styles.tag}>Your town</Text></View> : null}
          </View>
          {feeMode === 'free' ? <Text style={styles.freeTag}>Free</Text> : null}
          {feeMode === 'edit' && mine !== 'edit' ? (
            <RowFee fee={p.fee} label={`Delivery fee, ${title}`} onSave={(fee) => onFee(p, fee)} />
          ) : null}
          {mine !== 'edit' ? (
            <Pressable
              ref={reg?.(`more:${p.key}`)}
              accessibilityRole="button"
              accessibilityLabel={`More for ${title}`}
              accessibilityState={{ expanded: mine === 'menu' || mine === 'remove' }}
              onPress={() => (mine ? onClose() : onOpen({ kind: 'menu', place: p }, `more:${p.key}`))}
              hitSlop={4}
              style={({ pressed }) => [styles.more, (mine || pressed) && styles.moreOn]}
            >
              <DotsThreeIcon size={22} weight="bold" color={t.neutral[600]} />
            </Pressable>
          ) : null}
        </View>
        {mine === 'menu' ? (
          <RowMenu
            busy={busy}
            onChange={() => onOpen({ kind: 'edit', place: p }, `more:${p.key}`)}
            onRemove={() => onOpen({ kind: 'remove', place: p }, `more:${p.key}`)}
          />
        ) : null}
        {mine === 'remove' ? (
          <RemoveAsk
            title={title}
            busy={busy}
            onKeep={onClose}
            onRemove={async () => {
              const ok = await onRemove(p);
              if (ok !== false) onClose();
            }}
          />
        ) : null}
        {mine === 'edit' ? <PlaceForm key={`edit:${p.key}`} kind="edit" place={p} embedded {...formProps} /> : null}
      </View>
    );
  };
  return (
    <>
      {places.length ? (
        <View style={styles.list}>
          {towns.map((town) => (town.places.some((p) => !isWhole(p)) ? (
            <View key={town.id} style={styles.town}>
              <Text style={styles.townName} accessibilityRole="header">{nameOf(town.id)}</Text>
              {town.places.map((p) => row(p, true))}
            </View>
          ) : (
            <View key={town.id} style={styles.town}>{town.places.map((p) => row(p, false))}</View>
          )))}
        </View>
      ) : null}
      {adding ? (
        <PlaceForm key={panel.kind} kind={panel.kind} {...formProps} />
      ) : (
        <AddButton buttonRef={reg?.('add')} onPress={() => onOpen({ kind: 'add' }, 'add')} />
      )}
    </>
  );
}

/**
 * A line's fee, typed in place: saved on Done, when the box is left, or a
 * moment after typing stops; "Free" sets ₱0. A small "Saved" shows after.
 */
function RowFee({ fee, label, onSave }) {
  const shown = (f) => (f == null ? '' : String(Number(f)));
  const [text, setText] = useState(shown(fee));
  const [typing, setTyping] = useState(false);
  const [state, setState] = useState(null);
  const [prevFee, setPrevFee] = useState(fee);
  const timer = useRef(null);
  const inputRef = useRef(null);
  if (fee !== prevFee) {
    setPrevFee(fee);
    if (!typing) setText(shown(fee));
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const free = fee != null && Number(fee) === 0 && !typing;
  const bad = text.trim() !== '' && parseFee(text) === undefined;

  const put = async (next) => {
    clearTimeout(timer.current);
    if (next === undefined) return;
    if (next === null || (fee != null && Number(fee) === next)) {
      if (next === null) setText(shown(fee));
      return;
    }
    setState('saving');
    const ok = await onSave(next);
    setState(ok === false ? null : 'saved');
    if (ok === false) setText(shown(fee));
    else setTimeout(() => setState((s) => (s === 'saved' ? null : s)), 2500);
  };

  return (
    <View style={styles.rowFee}>
      {free ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: free. Tap to type an amount`}
          onPress={() => {
            setTyping(true);
            setText('');
            setTimeout(() => inputRef.current?.focus(), 30);
          }}
          style={[styles.chip, styles.chipOn]}
        >
          <CheckIcon size={13} weight="bold" color="#fff" />
          <Text style={[styles.chipText, styles.chipTextOn]}>Free</Text>
        </Pressable>
      ) : (
        <>
          <View style={[styles.box, styles.boxRow, bad && styles.boxBad, fee == null && !text && styles.boxMissing]}>
            <Text style={styles.peso}>₱</Text>
            <TextInput
              ref={inputRef}
              value={text}
              onFocus={() => setTyping(true)}
              onChangeText={(v) => {
                setText(v);
                clearTimeout(timer.current);
                const next = parseFee(v);
                if (next != null) timer.current = setTimeout(() => put(next), 1500);
              }}
              onSubmitEditing={() => put(parseFee(text))}
              onBlur={() => {
                setTyping(false);
                put(parseFee(text));
              }}
              placeholder={fee == null ? 'Fee' : '0'}
              placeholderTextColor={t.neutral[400]}
              keyboardType="decimal-pad"
              returnKeyType="done"
              accessibilityLabel={label}
              style={styles.boxInput}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: make it free`}
            onPress={() => {
              setTyping(false);
              setText('0');
              put(0);
            }}
            style={styles.chip}
          >
            <Text style={styles.chipText}>Free</Text>
          </Pressable>
        </>
      )}
      <View style={styles.rowFeeState} pointerEvents="none" accessibilityLiveRegion="polite">
        {state === 'saved' ? (
          <>
            <CheckIcon size={11} weight="bold" color={t.primary[700]} />
            <Text style={styles.rowFeeStateText}>Saved</Text>
          </>
        ) : state === 'saving' ? <Text style={styles.rowFeeStateText}>Saving…</Text> : null}
      </View>
    </View>
  );
}

/** The ⋯ menu, under the line: Change barangays, Remove. */
function RowMenu({ busy, onChange, onRemove }) {
  const firstRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => focusNode(firstRef.current), 60);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.menu}>
      <Pressable ref={firstRef} accessibilityRole="button" disabled={busy} onPress={onChange} style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
        <Text style={styles.menuText}>Change barangays</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onRemove} style={({ pressed }) => [styles.menuBtn, styles.menuRemove, pressed && styles.pressed]}>
        <Text style={[styles.menuText, styles.menuRemoveText]}>Remove</Text>
      </Pressable>
    </View>
  );
}

/** "Stop delivering here? [Keep] [Remove]", on the line. */
function RemoveAsk({
  title, busy, onKeep, onRemove,
}) {
  const keepRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => focusNode(keepRef.current), 60);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.ask} accessibilityLabel={`Remove ${title}?`}>
      <Text style={styles.askText}>Stop delivering here?</Text>
      <SmallButton buttonRef={keepRef} label="Keep" onPress={onKeep} />
      <SmallButton danger label={busy ? 'Removing…' : 'Remove'} disabled={busy} onPress={onRemove} />
    </View>
  );
}

function SmallButton({
  label, onPress, disabled = false, danger = false, buttonRef,
}) {
  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.small, danger && styles.smallDanger, disabled && styles.off]}
    >
      <Text style={[styles.smallText, danger && styles.smallTextDanger]}>{label}</Text>
    </Pressable>
  );
}

/** The forms' and the distance card's buttons: Cancel (plain), the main one (green). */
function PanelButton({
  label, onPress, disabled = false, primary = false, ghost = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pbtn, primary && styles.pbtnPrimary, ghost && styles.pbtnGhost, pressed && styles.pressed, disabled && styles.off,
      ]}
    >
      <Text style={[styles.pbtnText, primary && styles.pbtnTextPrimary, ghost && styles.pbtnTextGhost]}>{label}</Text>
    </Pressable>
  );
}

/** A fee: a ₱ box with [Free] [₱20] [₱30] [₱50] beside it. */
export function FeeChoice({ value, onChange, label = 'Delivery fee' }) {
  const shown = (f) => (f == null ? '' : String(Number(f)));
  const [text, setText] = useState(shown(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    const typed = parseFee(text);
    if ((value != null && typed !== value) || (value == null && typed != null)) setText(shown(value));
  }
  const bad = text.trim() !== '' && parseFee(text) === undefined;
  return (
    <View style={styles.feeq}>
      <View style={[styles.box, styles.boxFee, bad && styles.boxBad]}>
        <Text style={styles.peso}>₱</Text>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            const fee = parseFee(v);
            onChange(fee === undefined ? null : fee);
          }}
          placeholder="0"
          placeholderTextColor={t.neutral[400]}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          style={styles.boxInput}
        />
      </View>
      <View style={styles.chips}>
        {QUICK_FEES.map((fee) => {
          const on = value != null && Number(value) === fee;
          return (
            <Pressable
              key={fee}
              accessibilityRole="button"
              accessibilityState={web ? undefined : { selected: on }}
              {...(web ? { 'aria-pressed': on } : {})}
              onPress={() => {
                setText(String(fee));
                onChange(fee);
              }}
              style={[styles.chip, styles.chipQuick, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{fee === 0 ? 'Free' : pesos(fee)}</Text>
            </Pressable>
          );
        })}
      </View>
      {bad ? <Text style={styles.err}>Enter ₱0 to ₱{MAX_FEE.toLocaleString('en-PH')}.</Text> : null}
    </View>
  );
}

/** When it opens: in sight, and focus on its first control. */
function useOpenFocus(boxRef, firstRef, margin) {
  const reveal = useReveal();
  useEffect(() => {
    const timer = setTimeout(() => {
      reveal?.(boxRef.current, margin);
      focusNode(firstRef.current);
    }, 80);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Add a place, or change one, in one small form (no steps): the town, all
 * of it or some barangays (picked right there), the fee, [Add]. While
 * charging by distance there is no fee to ask.
 */
export function PlaceForm({
  kind, place, plan, municipalities, homeId, onClose, onSave, embedded = false,
}) {
  const editKey = kind === 'edit' ? place?.key : null;
  const skipFee = plan.distance || plan.free;
  const homeListed = plan.places.some((p) => p.municipalityId === homeId);
  const [town, setTown] = useState(() => {
    if (kind === 'edit') return place.municipalityId;
    if (kind === 'home' || (homeId && !homeListed)) return homeId || '';
    return '';
  });
  const [picking, setPicking] = useState(false);
  const [where, setWhere] = useState(kind === 'edit' && !isWhole(place) ? 'some' : 'all');
  const [barangays, setBarangays] = useState(kind === 'edit' ? [...place.barangays] : []);
  const [fee, setFee] = useState(kind === 'edit' ? place.fee : null);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const firstRef = useRef(null);
  useOpenFocus(boxRef, firstRef, embedded ? 110 : 12);

  const nameOf = (id) => municipalities.find((m) => m.id === id)?.name || 'Town';
  const all = town === 'all';
  const townName = town && !all ? nameOf(town) : '';
  const listedWhole = town && !all ? wholeTown(plan, town, editKey) : null;
  const listed = new Set(plan.places.map((p) => p.municipalityId));
  const ready = Boolean(town) && (all || where === 'all' || barangays.length > 0) && (skipFee || fee != null);
  const options = [
    ...(homeId ? [{ id: homeId, label: `${nameOf(homeId)} (your town)` }] : []),
    ...(kind !== 'edit' ? [{ id: 'all', label: 'All towns in Oriental Mindoro' }] : []),
    ...municipalities.filter((m) => m.id !== homeId).map((m) => ({
      id: m.id, label: `${m.name}${listed.has(m.id) && m.id !== place?.municipalityId ? ' · in your list' : ''}`,
    })),
  ];
  const townLabel = options.find((o) => o.id === town)?.label || 'Choose a town';

  const pickTown = (id) => {
    setTown(id);
    setPicking(false);
    setWhere('all');
    setBarangays([]);
    const whole = id && id !== 'all' ? wholeTown(plan, id, editKey) : null;
    if (whole && fee == null) setFee(whole.fee);
  };
  const submit = async () => {
    if (!ready || saving) return;
    const theFee = skipFee ? (place?.fee ?? null) : fee;
    const next = all
      ? putAllTowns(plan, municipalities.map((m) => m.id), theFee)
      : putPlace(plan, { municipalityId: town, barangays: where === 'some' ? barangays : [], fee: theFee }, editKey);
    setSaving(true);
    try {
      await onSave(next, all ? 'All towns added' : 'Delivery place saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View ref={boxRef} collapsable={false} style={[styles.form, embedded && styles.formEmbedded]} accessibilityLabel={kind === 'edit' ? 'Change this place' : 'Add a place'}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Town</Text>
        <Pressable
          ref={firstRef}
          accessibilityRole="button"
          accessibilityLabel={`Town: ${townLabel}`}
          accessibilityState={{ expanded: picking }}
          onPress={() => setPicking((v) => !v)}
          style={[styles.select, picking && styles.selectOpen]}
        >
          <Text style={[styles.selectText, !town && styles.selectPlaceholder]} numberOfLines={1}>{townLabel}</Text>
          <CaretDownIcon size={16} weight="bold" color={picking ? t.primary[600] : t.neutral[500]} />
        </Pressable>
        {picking ? (
          <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.map((o) => (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityState={web ? undefined : { selected: o.id === town }}
                onPress={() => pickTown(o.id)}
                style={({ pressed }) => [styles.option, o.id === town && styles.optionOn, pressed && styles.optionPressed]}
              >
                <Text style={[styles.optionText, o.id === town && styles.optionTextOn]}>{o.label}</Text>
                {o.id === town ? <CheckIcon size={16} weight="bold" color={t.primary[600]} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {town && !all && !picking ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Where</Text>
          <View style={styles.seg}>
            {[['all', `All of ${townName}`], ['some', 'Some barangays']].map(([key, text]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={web ? undefined : { selected: where === key }}
                {...(web ? { 'aria-pressed': where === key } : {})}
                onPress={() => setWhere(key)}
                style={[styles.segBtn, where === key && styles.segBtnOn]}
              >
                <Text style={[styles.segText, where === key && styles.segTextOn]} numberOfLines={1}>{text}</Text>
              </Pressable>
            ))}
          </View>
          {listedWhole && !skipFee ? (
            <Text style={styles.fieldNote}>
              {where === 'all' ? `Now ${feeLabel(listedWhole.fee)}` : `The rest of ${townName} stays ${feeLabel(listedWhole.fee)}`}
            </Text>
          ) : null}
          {where === 'some' ? (
            <BarangayChecklist
              townName={townName}
              picked={barangays}
              onChange={setBarangays}
              others={plan.places.filter((p) => p.municipalityId === town && !isWhole(p) && p.key !== editKey)}
              hideFees={plan.distance}
            />
          ) : null}
        </View>
      ) : null}

      {!skipFee && !picking ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Fee</Text>
          <FeeChoice value={fee} onChange={setFee} label="Delivery fee" />
        </View>
      ) : null}

      <View style={styles.formFoot}>
        <PanelButton ghost label="Cancel" onPress={onClose} />
        <View style={styles.flex} />
        <PanelButton primary label={saving ? 'Saving…' : kind === 'edit' ? 'Save' : 'Add'} disabled={!ready || saving} onPress={submit} />
      </View>
    </View>
  );
}

/** Back to fees per place with places that have none: one fee for them. */
function MissingFees({ count, onSave, onClose }) {
  const [fee, setFee] = useState(null);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const firstRef = useRef(null);
  useOpenFocus(boxRef, firstRef, 12);
  return (
    <View ref={boxRef} collapsable={false} style={styles.form}>
      <Text ref={firstRef} style={styles.formTitle} accessibilityRole="header" {...FOCUSABLE_HEADING}>
        Fee for {count === 1 ? 'the new place' : `the ${plural(count, 'new place')}`}
      </Text>
      <FeeChoice value={fee} onChange={setFee} label="Delivery fee" />
      <View style={styles.formFoot}>
        <PanelButton ghost label="Cancel" onPress={onClose} />
        <View style={styles.flex} />
        <PanelButton
          primary
          label={saving ? 'Saving…' : 'Save'}
          disabled={fee == null || saving}
          onPress={async () => {
            setSaving(true);
            try {
              await onSave(fee);
            } finally {
              setSaving(false);
            }
          }}
        />
      </View>
    </View>
  );
}

/** The town's barangays (PSGC, as the address picker loads them). */
function useBarangays(townName) {
  const [state, setState] = useState({ status: 'loading', list: [] });
  useEffect(() => {
    const code = SERVICE_MUNICIPALITIES.find((m) => normalizeName(m.name) === normalizeName(townName))?.code;
    let live = true;
    Promise.resolve().then(() => { if (live) setState({ status: 'loading', list: [] }); });
    if (!code) {
      Promise.resolve().then(() => { if (live) setState({ status: 'failed', list: [] }); });
      return () => { live = false; };
    }
    listBarangays(code)
      .then((list) => { if (live) setState({ status: list.length ? 'ready' : 'failed', list: list.map((b) => b.name) }); })
      .catch(() => { if (live) setState({ status: 'failed', list: [] }); });
    return () => { live = false; };
  }, [townName]);
  return state;
}

/**
 * A searchable checklist of a town's barangays, with Pick all and Clear; one
 * typed when the list can't load. Barangays already in another line of the
 * town show its fee: picking them moves them here.
 */
function BarangayChecklist({
  townName, picked, onChange, others = [], hideFees = false,
}) {
  const { status, list } = useBarangays(townName);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const pickedKeys = useMemo(() => new Set(picked.map(brgyKey)), [picked]);
  const elsewhere = useMemo(() => {
    const map = new Map();
    for (const p of others) for (const b of p.barangays) map.set(brgyKey(b), p.fee);
    return map;
  }, [others]);
  const all = useMemo(() => {
    const known = new Set(list.map(brgyKey));
    const extra = [...picked, ...others.flatMap((p) => p.barangays)].filter((b) => !known.has(brgyKey(b)));
    return [...list, ...extra.filter((b, i) => extra.findIndex((x) => brgyKey(x) === brgyKey(b)) === i)];
  }, [list, picked, others]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((b) => b.toLowerCase().includes(q)) : all;
  const toggle = (name) => onChange(pickedKeys.has(brgyKey(name))
    ? picked.filter((b) => brgyKey(b) !== brgyKey(name))
    : [...picked, name]);
  const pickShown = () => onChange([...picked, ...shown.filter((b) => !pickedKeys.has(brgyKey(b)))]);
  const clearShown = () => {
    const off = new Set(shown.map(brgyKey));
    onChange(picked.filter((b) => !off.has(brgyKey(b))));
  };
  const addTyped = () => {
    const name = typed.replace(/\s+/g, ' ').trim();
    if (!name) return;
    if (!pickedKeys.has(brgyKey(name))) onChange([...picked, name]);
    setTyped('');
  };

  return (
    <View style={styles.brgy}>
      {all.length ? (
        <>
          <View style={styles.search}>
            <MagnifyingGlassIcon size={18} color={t.neutral[500]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${all.length} barangays`}
              placeholderTextColor={t.neutral[400]}
              accessibilityLabel={`Search barangays in ${townName}`}
              returnKeyType="search"
              style={styles.searchInput}
            />
          </View>
          <View style={styles.brgyBar}>
            <Text style={styles.brgyCount}>{picked.length} picked</Text>
            <View style={styles.flex} />
            <SmallButton label={q ? 'Pick these' : 'Pick all'} onPress={pickShown} />
            <SmallButton label="Clear" onPress={clearShown} disabled={!picked.length} />
          </View>
        </>
      ) : null}
      {status === 'loading' && !all.length ? <Text style={styles.hint}>Loading barangays…</Text> : null}
      {all.length ? (
        <ScrollView style={styles.checklist} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {shown.map((b) => {
            const on = pickedKeys.has(brgyKey(b));
            const now = elsewhere.get(brgyKey(b));
            return (
              <Pressable key={b} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(b)} style={[styles.check, on && styles.checkOn]}>
                <View style={[styles.cbox, on && styles.cboxOn]}>{on ? <CheckIcon size={13} weight="bold" color="#fff" /> : null}</View>
                <Text style={[styles.checkText, on && styles.checkTextOn]}>{b}</Text>
                {elsewhere.has(brgyKey(b)) && !on ? (
                  <Text style={styles.checkNow}>{hideFees ? 'In your list' : `${now == null ? 'No fee' : Number(now) === 0 ? 'Free' : pesos(now)} now`}</Text>
                ) : null}
              </Pressable>
            );
          })}
          {!shown.length ? <Text style={styles.hint}>No barangay matches “{query}”.</Text> : null}
        </ScrollView>
      ) : null}
      {status === 'failed' ? (
        <View style={styles.typed}>
          <Text style={styles.hint}>Barangay list unavailable. Type each one.</Text>
          <View style={styles.typedRow}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Barangay name"
              placeholderTextColor={t.neutral[400]}
              accessibilityLabel="Barangay name"
              returnKeyType="done"
              onSubmitEditing={addTyped}
              blurOnSubmit={false}
              style={styles.typedInput}
            />
            <SmallButton label="Add" onPress={addTyped} />
          </View>
          {picked.length ? <Text style={styles.hint}>Picked: {picked.join(', ')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const PREVIEW_KM = [2, 5, 10];
const kmLabel = (km) => `${Number(km).toLocaleString('en-PH', { maximumFractionDigits: 1 })} km`;
const KM_FIELDS = ['baseFee', 'includedKm', 'perKm', 'maxKm'];

/**
 * "By distance", on the screen: the starting fee, the km it covers, each
 * extra km, the farthest; what buyers pay at 2, 5 and 10 km; the shop pin
 * note. Not on yet: "Use distance fee" turns it on. On: Save keeps changes.
 */
function DistanceFields({
  plan, platformRate, extras, note, busy, onSave,
}) {
  const [k, setK] = useState(plan.perKm);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = !plan.distance;
  const dirty = KM_FIELDS.some((f) => String(k[f] ?? '') !== String(plan.perKm[f] ?? ''));
  const problems = distanceProblems(k);
  const errorOf = (key) => (tried ? problems.find((p) => p.key === `perKm.${key}`)?.message : null);
  const rate = distanceRate(k, platformRate);
  const field = (key, label, unit, placeholder) => (
    <View style={styles.km}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.box, styles.boxKm, errorOf(key) && styles.boxBad]}>
        {unit === '₱' ? <Text style={styles.peso}>₱</Text> : null}
        <TextInput
          value={k[key]}
          onChangeText={(v) => setK((prev) => ({ ...prev, [key]: v }))}
          placeholder={placeholder}
          placeholderTextColor={t.neutral[400]}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          style={styles.boxInput}
        />
        {unit === 'km' ? <Text style={styles.peso}>km</Text> : null}
      </View>
      {errorOf(key) ? <Text style={styles.err}>{errorOf(key)}</Text> : null}
    </View>
  );
  const submit = async () => {
    setTried(true);
    if (problems.length) return;
    setSaving(true);
    try {
      await onSave(k);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={styles.kmCard}>
      <View style={styles.kmGrid}>
        {field('baseFee', 'Starting fee', '₱', String(platformRate.base))}
        {field('includedKm', 'Km included', 'km', String(platformRate.included))}
        {field('perKm', 'Each extra km', '₱', String(platformRate.perKm))}
        {field('maxKm', 'Max distance', 'km', 'No limit')}
      </View>
      {rate ? (
        <Text style={styles.kmPreview}>
          {PREVIEW_KM.map((km, i) => (
            <Text key={km}>
              {i > 0 ? ' · ' : ''}{kmLabel(km)} <Text style={styles.kmPreviewFee}>{rate.max != null && km > rate.max ? 'too far' : pesos(distanceFeeAt(rate, km))}</Text>
            </Text>
          ))}
        </Text>
      ) : null}
      {extras || (note ? (
        <View style={styles.pinNote}>
          <WarningIcon size={15} weight="fill" color={t.warning[700]} />
          <Text style={styles.pinNoteText}>{note}</Text>
        </View>
      ) : null)}
      <View style={styles.kmFoot}>
        {pending ? <Text style={styles.kmState}>Not on yet</Text> : null}
        {!pending && dirty ? (
          <PanelButton
            ghost
            label="Undo"
            onPress={() => {
              setK(plan.perKm);
              setTried(false);
            }}
          />
        ) : null}
        <View style={styles.flex} />
        {!pending && !dirty ? (
          <View style={styles.kmSaved}>
            <CheckIcon size={15} weight="bold" color={t.primary[700]} />
            <Text style={styles.kmSavedText}>Saved</Text>
          </View>
        ) : (
          <PanelButton primary label={saving ? 'Saving…' : pending ? 'Use distance fee' : 'Save'} disabled={saving || busy} onPress={submit} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.5 },
  wrap: { gap: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  title: { fontSize: 18, lineHeight: 24, color: t.neutral[900], ...font(500), outlineStyle: 'none' },

  // [Fee per place] [By distance]
  mode: { flexDirection: 'row', gap: 8 },
  modeOpt: {
    flex: 1, minWidth: 0, gap: 4, paddingVertical: 13, paddingHorizontal: 13,
    borderWidth: 2, borderColor: t.primary[600], borderRadius: 16, backgroundColor: t.neutral[0],
  },
  modeOpt3: { paddingVertical: 11, paddingHorizontal: 10, borderRadius: 14 },
  modeOptOn: { backgroundColor: t.primary[600], boxShadow: '0px 8px 20px rgba(4, 120, 87, 0.22)' },
  modeOptPressed: { backgroundColor: t.primary[50] },
  modeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  modeTick: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.neutral[300], alignItems: 'center', justifyContent: 'center',
  },
  modeTickOn: { borderColor: '#fff', backgroundColor: '#fff' },
  modeLabel: { fontSize: 16.5, lineHeight: 21, color: t.primary[700], ...font(500) },
  modeLabel3: { fontSize: 15, lineHeight: 19 },
  modeLabelOn: { color: '#fff' },
  modeHint: { fontSize: 13, lineHeight: 18, color: t.neutral[600], ...font(400) },
  modeHint3: { fontSize: 12.5, lineHeight: 17 },
  modeHintOn: { color: 'rgba(255, 255, 255, 0.92)' },
  subTitle: { marginTop: 4, marginBottom: -2, fontSize: 15, lineHeight: 21, color: t.neutral[800], ...font(500) },

  empty: {
    alignItems: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.primary[200], borderRadius: 16, backgroundColor: t.primary[50],
  },
  emptyTitle: { fontSize: 16, lineHeight: 22, color: t.neutral[900], textAlign: 'center', ...font(500) },
  big: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', minHeight: 54, paddingHorizontal: 18,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  bigPrimary: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  bigText: { fontSize: 16, lineHeight: 22, color: t.neutral[800], ...font(500) },
  bigTextPrimary: { color: '#fff' },

  summary: { gap: 4, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: t.success[50] },
  summaryTitle: { marginBottom: 2, fontSize: 14, lineHeight: 20, color: t.primary[800], ...font(500) },
  summaryLine: { fontSize: 14.5, lineHeight: 21, color: t.neutral[800], ...font(400) },

  // A ₱ box
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 46, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  boxSmall: { width: 88, height: 40 },
  boxRow: { width: 74, height: 40, paddingHorizontal: 9 },
  boxFee: { width: 88 },
  boxKm: { alignSelf: 'stretch' },
  boxBad: { borderColor: t.danger[500], backgroundColor: t.danger[50] },
  boxMissing: { borderColor: t.warning[400], backgroundColor: t.warning[50] },
  boxInput: {
    flex: 1, minWidth: 0, height: '100%', paddingVertical: 0, fontSize: 16, color: t.neutral[900], ...font(500), outlineStyle: 'none',
  },
  peso: { fontSize: 15, lineHeight: 21, color: t.neutral[500], ...font(400) },

  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 40, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  chipQuick: { paddingHorizontal: 11 },
  chipOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  chipText: { fontSize: 14, lineHeight: 19, color: t.neutral[800], ...font(500) },
  chipTextOn: { color: '#fff' },
  feeq: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  sameFee: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 14, backgroundColor: t.neutral[50],
  },
  sameFeeLabel: { flex: 1, minWidth: 100, fontSize: 14, lineHeight: 20, color: t.neutral[700], ...font(500) },

  list: { gap: 12 },
  town: { gap: 8 },
  townName: { marginTop: 2, marginLeft: 4, marginBottom: -2, fontSize: 13.5, lineHeight: 19, color: t.neutral[600], ...font(500) },
  freeTag: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: t.primary[50],
    color: t.primary[700], fontSize: 14, lineHeight: 19, ...font(500),
  },
  row: {
    paddingVertical: 10, paddingLeft: 12, paddingRight: 6, borderWidth: 1, borderColor: t.neutral[100], borderRadius: 14,
    backgroundColor: t.neutral[0], boxShadow: ELEV_CARD,
  },
  rowOpen: { paddingBottom: 14, borderColor: t.primary[300], boxShadow: `0px 0px 0px 3px ${t.primary[50]}` },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15.5, lineHeight: 21, color: t.neutral[900], ...font(500) },
  rowDetail: { fontSize: 13, lineHeight: 18, color: t.neutral[600], ...font(400) },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    alignSelf: 'flex-start', paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.primary[50], color: t.primary[700], fontSize: 12, lineHeight: 17, ...font(500),
  },
  tagPink: { backgroundColor: '#fdf2f8', color: '#be185d' },
  rowFee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowFeeState: {
    position: 'absolute', top: '100%', left: 0, flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1,
  },
  rowFeeStateText: { fontSize: 11.5, lineHeight: 15, color: t.primary[700], ...font(500) },
  more: { width: 36, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moreOn: { backgroundColor: t.neutral[100] },
  menu: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10, marginRight: 6, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  menuBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', backgroundColor: t.primary[50] },
  menuRemove: { backgroundColor: t.danger[50] },
  menuText: { fontSize: 14, lineHeight: 20, color: t.primary[700], ...font(500) },
  menuRemoveText: { color: t.danger[600] },
  ask: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, marginRight: 6, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  askText: { flex: 1, minWidth: 140, fontSize: 14, lineHeight: 20, color: t.neutral[800], ...font(500) },
  small: {
    minHeight: 38, paddingHorizontal: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
    backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  smallDanger: { borderColor: t.danger[600], backgroundColor: t.danger[600] },
  smallText: { fontSize: 13.5, lineHeight: 18, color: t.primary[700], ...font(500) },
  smallTextDanger: { color: '#fff' },

  add: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.primary[300], borderRadius: 14, backgroundColor: t.neutral[0],
  },
  addPressed: { backgroundColor: t.primary[50] },
  addText: { fontSize: 15.5, lineHeight: 21, color: t.primary[700], ...font(500) },

  // Add a place / change one
  form: {
    gap: 14, padding: 14, borderWidth: 1.5, borderColor: t.primary[200], borderRadius: 16,
    backgroundColor: t.neutral[0], boxShadow: '0px 10px 30px rgba(15, 23, 42, 0.08)',
  },
  formEmbedded: {
    marginTop: 12, paddingTop: 14, paddingLeft: 0, paddingRight: 6, paddingBottom: 0, borderWidth: 0, borderTopWidth: 1,
    borderTopColor: t.neutral[100], borderRadius: 0, boxShadow: 'none',
  },
  formTitle: { fontSize: 16, lineHeight: 22, color: t.neutral[900], ...font(500), outlineStyle: 'none' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13.5, lineHeight: 19, color: t.neutral[700], ...font(400) },
  fieldNote: { fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(400) },
  select: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  selectOpen: { borderColor: t.primary[600] },
  selectText: { flex: 1, fontSize: 15.5, lineHeight: 21, color: t.neutral[900], ...font(400) },
  selectPlaceholder: { color: t.neutral[500] },
  options: { maxHeight: 300, padding: 4, borderRadius: 12, backgroundColor: t.neutral[50] },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: 10,
  },
  optionOn: { backgroundColor: t.primary[50] },
  optionPressed: { backgroundColor: t.neutral[100] },
  optionText: { flex: 1, fontSize: 15, lineHeight: 21, color: t.neutral[800], ...font(400) },
  optionTextOn: { color: t.primary[800], ...font(500) },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: t.neutral[100] },
  segBtn: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: t.neutral[0], boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.12)' },
  segText: { fontSize: 14, lineHeight: 19, color: t.neutral[700], ...font(500) },
  segTextOn: { color: t.primary[700] },
  formFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pbtn: {
    minHeight: 46, paddingHorizontal: 18, borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 999,
    backgroundColor: t.neutral[0], alignItems: 'center', justifyContent: 'center',
  },
  pbtnPrimary: { minWidth: 140, borderColor: t.primary[600], backgroundColor: t.primary[600] },
  pbtnGhost: { paddingHorizontal: 12, borderColor: 'transparent', backgroundColor: 'transparent' },
  pbtnText: { fontSize: 15, lineHeight: 21, color: t.neutral[800], ...font(500) },
  pbtnTextPrimary: { color: '#fff' },
  pbtnTextGhost: { color: t.neutral[600], ...font(400) },

  brgy: { gap: 8, marginTop: 4 },
  brgyBar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brgyCount: { fontSize: 13.5, lineHeight: 19, color: t.neutral[700], ...font(500) },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', paddingVertical: 0, fontSize: 15, color: t.neutral[900], ...font(400), outlineStyle: 'none' },
  checklist: { maxHeight: 280, padding: 4, borderRadius: 12, backgroundColor: t.neutral[50] },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  checkOn: { backgroundColor: t.primary[50] },
  cbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: t.neutral[400],
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  cboxOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  checkText: { flex: 1, fontSize: 15, lineHeight: 21, color: t.neutral[800], ...font(400) },
  checkTextOn: { color: t.primary[800], ...font(500) },
  checkNow: { fontSize: 12.5, lineHeight: 17, color: t.neutral[500], ...font(400) },
  hint: { paddingVertical: 6, paddingHorizontal: 4, fontSize: 13.5, lineHeight: 19, color: t.neutral[500], ...font(400) },
  typed: { gap: 6 },
  typedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typedInput: {
    flex: 1, minWidth: 0, height: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12,
    fontSize: 15, color: t.neutral[900], ...font(400), outlineStyle: 'none',
  },
  err: { fontSize: 13, lineHeight: 18, color: t.danger[600], ...font(500) },

  // By distance, under the switch
  kmCard: {
    gap: 12, padding: 14, borderWidth: 1.5, borderColor: t.primary[200], borderRadius: 16, backgroundColor: t.neutral[0], boxShadow: ELEV_CARD,
  },
  kmGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12 },
  km: { flexBasis: '46%', flexGrow: 1, gap: 6, minWidth: 0 },
  kmPreview: {
    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[50],
    fontSize: 14, lineHeight: 21, color: t.neutral[700], ...font(400),
  },
  kmPreviewFee: { color: t.primary[700], ...font(500) },
  kmFoot: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  kmState: { fontSize: 13.5, lineHeight: 19, color: t.warning[700], ...font(500) },
  kmSaved: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  kmSavedText: { fontSize: 14, lineHeight: 20, color: t.primary[700], ...font(400) },
  pinNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: t.warning[50],
  },
  pinNoteText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: t.warning[800], ...font(400) },
});
