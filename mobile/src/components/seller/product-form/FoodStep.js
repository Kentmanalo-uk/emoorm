import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CaretDownIcon, CookingPotIcon, ForkKnifeIcon, InfoIcon, PackageIcon, PlusIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import PhotoPicker from './PhotoPicker';
import ChoiceGroup from './ChoiceGroup';
import WayField, { derivedStyles } from './WayField';
import {
  Field, FieldError, FieldLabel, MoneyInput, PF, PfInput, PfSelect, Radio, Stepper, Suggest, Switch,
  UnitInput, useInvalidTarget,
} from './parts';
import {
  CHOICE_TYPES, FOOD_CHOICE_TYPES, FOOD_EXAMPLES, MAX_GROUPS, NAME_MAX, DESCRIPTION_MAX, SERVES_EXAMPLES, peso,
} from './formState';

/*
 * Local Delicacies' short form on one page (web ProductForm.jsx, its short
 * form): Packed food (kept in stock) or Cooked food (a menu item, posted on
 * Today's menu with its times), and only the food's important parts, in the
 * website's sections and words:
 *   Photos · Name and category (with "What kind is it?" and the words) ·
 *   Price and serving / Price and stock · Flavors or add-ons / Sizes or
 *   packs (optional) · How buyers get it (Packed food, shops that do both) ·
 *   More details (Packed food, closed until wanted).
 * An old paluto there keeps the full form (ProductForm's steps).
 */

const KIND_ICONS = { REGULAR: PackageIcon, READY_TO_EAT: CookingPotIcon };
const PACKED_TYPES = CHOICE_TYPES.filter((x) => x.name !== 'Color');

function Section({ title, hint, optional, first, children }) {
  return (
    <View style={[styles.section, first && styles.sectionFirst]}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
        {optional ? <Text style={styles.opt}>Optional</Text> : null}
      </View>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** "What kind is it?": Packed food or Cooked food, as two big cards. */
function FoodKinds({ options, value, onChange, error }) {
  const ref = useInvalidTarget(!!error);
  return (
    <View ref={ref} style={styles.field}>
      <FieldLabel label="What kind is it?" required />
      <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="What kind is it?">
        {options.map((o) => {
          const Icon = KIND_ICONS[o.key] || ForkKnifeIcon;
          const on = value === o.key;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.key)}
              style={[styles.kind, error && styles.kindInvalid, on && styles.kindOn]}
            >
              <View style={[styles.kindIcon, on && styles.kindIconOn]}>
                <Icon size={26} weight="fill" color={PF.green} />
              </View>
              <View style={styles.kindText}>
                <Text style={styles.kindTitle}>{o.label}</Text>
                <Text style={styles.kindHint}>{o.hint}</Text>
              </View>
              <Radio on={on} />
            </Pressable>
          );
        })}
      </View>
      <FieldError text={error} />
    </View>
  );
}

function Note({ icon: Icon = InfoIcon, children }) {
  return (
    <View style={styles.note}>
      <Icon size={17} color={PF.green} style={styles.noteIcon} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/**
 * @param {Object} props.ctx - kind, kindOpts, editing, couriersOn, shopMode, stockedGroup, hasOptions, offers, priceFrom
 * @param {Object} props.groupActions - ProductForm's choice group actions
 * @param {ReactNode} props.more - More details' rows (MoreStep), Packed food only
 */
export default function FoodStep({
  form, set, errors, categories, onCategory, onKind, onPackage, onHasOptions, groupActions,
  moreOpen, onMoreToggle, moreSummary, more, ctx,
}) {
  const {
    kind, kindOpts, editing, couriersOn, shopMode, stockedGroup, hasOptions, offers, priceFrom,
  } = ctx;
  const cooked = kind === 'READY_TO_EAT';
  const packed = kind === 'REGULAR';
  const ex = FOOD_EXAMPLES[kind] || FOOD_EXAMPLES.REGULAR;
  const askWay = !shopMode || shopMode === 'BOTH';
  const choiceErr = errors.options || Object.keys(errors).some((k) => k.startsWith('group-') && errors[k]);
  const choicesRef = useInvalidTarget(!!choiceErr);
  const moreRef = useInvalidTarget(!!(errors.salePrice || errors.priceTiers || (!couriersOn && errors.weightKg)));
  const photosOn = (g) => {
    const other = form.variations.find((x) => x.key !== g.key && x.choices.some((c) => x.images?.[c]));
    return other ? other.name.trim() || 'the other choice type' : null;
  };
  const total = stockedGroup
    ? stockedGroup.choices.reduce((n, c) => n + (parseInt(stockedGroup.stocks[c] || '0', 10) || 0), 0)
    : 0;

  const price = (
    <Field
      label={cooked ? 'Price of one serving' : 'Price'}
      required
      error={errors.price}
      hint={priceFrom ? null : `Example: ${cooked ? '120' : '85'}`}
    >
      {priceFrom ? (
        <View style={derivedStyles.box} accessibilityLiveRegion="polite">
          <Text style={derivedStyles.strong}>
            {priceFrom.span
              ? `${priceFrom.span.min === priceFrom.span.max ? '' : 'from '}${peso(priceFrom.span.min)}`
              : 'Type a price for each one below'}
          </Text>
          <Text style={derivedStyles.small}>Each choice has its own price (see below).</Text>
        </View>
      ) : (
        <MoneyInput value={form.price} onChange={(v) => set('price', v)} placeholder="" invalid={!!errors.price} />
      )}
    </Field>
  );

  const weight = (
    <Field
      label="Weight with the packaging"
      required={couriersOn}
      optional={!couriersOn}
      error={errors.weightKg}
      hint={couriersOn
        ? 'Couriers use it to work out the delivery fee. Example: 0.5 kg'
        : 'Only needed if a courier delivers it. Example: 0.5 kg'}
    >
      <UnitInput value={form.weightKg} onChange={(v) => set('weightKg', v)} placeholder="" invalid={!!errors.weightKg} />
    </Field>
  );

  const choiceWords = cooked
    ? { title: 'Flavors or add-ons', label: 'Buyers can pick a flavor or add-on', sub: 'Example: Original or Spicy, with rice or without', more: 'like Rice as well as Flavor' }
    : { title: 'Sizes or packs', label: 'It comes in different sizes or packs', sub: 'Example: 250g and 500g, or 6 pieces', more: 'like Pack size as well as Weight' };

  return (
    <View style={styles.page}>
      {/* 1. Photos */}
      <Section title="Photos" hint="The first photo is the one buyers see first." first>
        <Field error={errors.images}>
          <PhotoPicker images={form.images} onChange={(imgs) => set('images', imgs)} />
        </Field>
      </Section>

      {/* 2. Name and category */}
      <Section title="Name and category">
        <Field
          label="Product name"
          required
          error={errors.name}
          hint={ex.name.replace(/^e\.g\. /, 'Example: ')}
          aside={form.name.length ? `${form.name.length}/${NAME_MAX}` : null}
        >
          <PfInput
            value={form.name}
            maxLength={NAME_MAX}
            onChangeText={(v) => set('name', v)}
            autoComplete="off"
            autoCorrect={false}
          />
        </Field>

        <Field label="Category" required error={errors.categoryId}>
          <PfSelect
            value={form.categoryId}
            onChange={onCategory}
            title="Category"
            placeholder="Choose a category"
            options={[{ value: '', label: 'Choose a category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>

        {kindOpts.length > 1 ? <FoodKinds options={kindOpts} value={kind} onChange={onKind} error={errors.kind} /> : null}
        {!kind ? <Note>Tap <Text style={styles.strong}>Packed food</Text> or <Text style={styles.strong}>Cooked food</Text>. The rest of the form follows.</Note> : null}

        <Field
          label="Tell buyers about it"
          required
          error={errors.description}
          hint={ex.description.replace(/^e\.g\. /, 'Example: ')}
          aside={form.description.length > DESCRIPTION_MAX - 200 ? `${form.description.length}/${DESCRIPTION_MAX}` : null}
        >
          <PfInput
            multiline
            maxLength={DESCRIPTION_MAX}
            value={form.description}
            onChangeText={(v) => set('description', v)}
          />
        </Field>

        {!editing ? (
          <Pressable accessibilityRole="button" onPress={onPackage} style={styles.pkg}>
            <PackageIcon size={18} color={PF.green} />
            <Text style={styles.pkgText}>
              Selling a few products together as one set? <Text style={styles.pkgStrong}>Make a package</Text>
            </Text>
          </Pressable>
        ) : null}
      </Section>

      {/* 3. Price, and serving or stock */}
      {cooked ? (
        <Section title="Price and serving">
          {price}
          <Field label="Good for how many people?" optional>
            <PfInput
              value={form.serves}
              maxLength={60}
              onChangeText={(v) => set('serves', v)}
              placeholder="Tap one below, or type it"
              autoComplete="off"
            />
            <Suggest label="Tap one:" items={SERVES_EXAMPLES} isOn={(x) => form.serves === x} onPick={(x) => set('serves', x)} />
          </Field>
          <Note icon={CookingPotIcon}>
            How many you have, and when buyers can order: you set these each time you post it on Today&apos;s menu.
          </Note>
        </Section>
      ) : null}
      {packed ? (
        <Section title="Price and stock">
          {price}
          <Field
            label="How many do you have?"
            required
            error={errors.stock}
            hint={stockedGroup ? null : 'It goes down by itself when someone buys.'}
          >
            {stockedGroup ? (
              <View style={derivedStyles.box} accessibilityLiveRegion="polite">
                <Text style={derivedStyles.strong}>{total} in all</Text>
                <Text style={derivedStyles.small}>Counted from your choices below.</Text>
              </View>
            ) : (
              <Stepper value={form.stock} onChange={(v) => set('stock', v)} invalid={!!errors.stock} label="How many you have" />
            )}
          </Field>
          <Field label="Size or weight" optional hint="Example: 250g pack, 1 kilo, 12 pieces">
            <PfInput
              value={form.size}
              maxLength={60}
              onChangeText={(v) => set('size', v)}
              autoComplete="off"
            />
          </Field>
          {couriersOn ? weight : null}
        </Section>
      ) : null}

      {/* 4. Choices: only when switched on */}
      {kind ? (
        <Section title={choiceWords.title} optional>
          <View ref={choicesRef}>
            <Switch checked={hasOptions} onChange={onHasOptions} label={choiceWords.label} sub={choiceWords.sub} />
          </View>
          <FieldError text={errors.options} />
          {hasOptions ? (
            <View style={styles.groups}>
              {form.variations.map((g, index) => (
                <ChoiceGroup
                  key={g.key}
                  group={g}
                  index={index}
                  count={form.variations.length}
                  error={errors[`group-${g.key}`]}
                  types={cooked ? FOOD_CHOICE_TYPES : PACKED_TYPES}
                  noPrice={!offers.choicePrices}
                  noStock={!offers.choiceStock}
                  onChange={(change) => groupActions.update(g.key, change)}
                  onAddChoices={(raw) => groupActions.addChoices(g.key, raw)}
                  onRemoveChoice={(c) => groupActions.removeChoice(g.key, c)}
                  onToggle={(flag) => groupActions.toggleFlag(g.key, flag)}
                  onRemove={() => groupActions.remove(g.key)}
                  onPhoto={(c, url) => groupActions.setPhoto(g.key, c, url)}
                  photosOn={photosOn(g)}
                />
              ))}
              {form.variations.length < MAX_GROUPS ? (
                <Pressable accessibilityRole="button" onPress={groupActions.add} style={styles.addGroup}>
                  <PlusIcon size={16} color={PF.greenDark} />
                  <Text style={styles.addGroupText}>Add another</Text>
                  <Text style={styles.addGroupSmall}>{choiceWords.more}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* 5. How buyers get it: Packed food, when the shop does both */}
      {packed && askWay ? (
        <Section title="How buyers get it">
          <WayField
            value={form.fulfillment}
            onChange={(v) => set('fulfillment', v)}
            shopMode={shopMode}
            kind={kind}
            couriersOn={couriersOn}
            label={null}
          />
        </Section>
      ) : null}

      {/* 6. More details: Packed food, closed until wanted */}
      {packed ? (
        <View ref={moreRef} style={[styles.section, styles.moreSection]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            onPress={onMoreToggle}
            style={styles.moreHead}
          >
            <View style={styles.moreText}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>More details</Text>
                <Text style={styles.opt}>Optional</Text>
              </View>
              <Text style={styles.moreSummary}>{moreSummary}</Text>
            </View>
            <View style={moreOpen ? styles.caretOpen : null}>
              <CaretDownIcon size={20} color={PF.muted} />
            </View>
          </Pressable>
          {moreOpen ? <View style={styles.moreBody}>{more}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  page: { minWidth: 0 },
  // The website's phone look: white sections edge to edge, a grey band between them.
  section: {
    marginHorizontal: -12, paddingTop: 20, paddingBottom: 24, paddingHorizontal: 12,
    borderTopWidth: 8, borderTopColor: t.neutral[100], backgroundColor: t.neutral[0], gap: 4,
  },
  sectionFirst: { borderTopWidth: 0, paddingTop: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, lineHeight: 24, color: PF.ink, ...font(500) },
  sectionHint: { fontSize: 13, lineHeight: 18.85, color: PF.muted, ...font(400) },
  sectionBody: { gap: 20, minWidth: 0, marginTop: 14 },
  opt: {
    paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.neutral[100], color: PF.muted, fontSize: 11.5, lineHeight: 16, ...font(600),
  },
  field: { gap: 6, minWidth: 0 },
  strong: { color: PF.ink, ...font(600) },

  kinds: { gap: 10 },
  kind: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, minWidth: 0, minHeight: 96, padding: 16,
    borderWidth: 1.5, borderColor: PF.line, borderRadius: 16, backgroundColor: t.neutral[0],
  },
  kindInvalid: { borderColor: t.danger[300] },
  kindOn: { borderColor: PF.green, backgroundColor: PF.greenSoft },
  kindIcon: {
    width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  kindIconOn: { backgroundColor: t.neutral[0] },
  kindText: { flex: 1, minWidth: 0, gap: 4 },
  kindTitle: { fontSize: 17, lineHeight: 22, color: PF.ink, ...font(600) },
  kindHint: { fontSize: 13.5, lineHeight: 19.6, color: PF.muted, ...font(400) },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: t.neutral[50],
  },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20.3, color: t.neutral[700], ...font(400) },

  pkg: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 44, marginTop: 2,
    paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: PF.line,
  },
  pkgText: { flexShrink: 1, fontSize: 13.5, lineHeight: 21.6, color: PF.muted, ...font(400) },
  pkgStrong: { color: PF.greenDark, ...font(700) },

  groups: { gap: 12 },
  addGroup: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 6, rowGap: 4,
    minHeight: 52, paddingVertical: 8, paddingHorizontal: 16,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 14,
  },
  addGroupText: { fontSize: 14, lineHeight: 22.4, color: PF.greenDark, ...font(600) },
  addGroupSmall: { fontSize: 12.5, lineHeight: 20, color: PF.muted, ...font(400) },

  moreSection: { paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
  moreHead: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 16, paddingHorizontal: 12,
  },
  moreText: { flex: 1, minWidth: 0, gap: 4 },
  moreSummary: { fontSize: 13, lineHeight: 18.85, color: PF.muted, ...font(400) },
  caretOpen: { transform: [{ rotate: '180deg' }] },
  moreBody: { paddingHorizontal: 12, paddingBottom: 20 },
}));
