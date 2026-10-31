import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PackageIcon } from '../../../lib/icons';
import { font, themed } from '../../../theme';
import PhotoPicker from './PhotoPicker';
import {
  Field, FieldError, FieldLabel, MoneyInput, PF, PfInput, PfSelect, RadioCards, useInvalidTarget,
} from './parts';
import { EXAMPLES, NAME_MAX, DESCRIPTION_MAX, peso } from './formState';
import { derivedStyles } from './WayField';

const PRICE_WORDS = {
  REGULAR: { label: 'Price' },
  READY_TO_EAT: { label: 'Price', hint: 'For one serving.' },
  COOK_TO_ORDER: { label: 'Price', hint: 'Different sizes and prices? Add them in the next step.' },
  LIVESTOCK: { label: 'Asking price per head', hint: 'For one animal. Buyers make offers, and you agree on the price in chat.' },
};

/*
 * Step 1 (web product-form/BasicsStep.jsx): photos, name, category (then
 * "What kind?" when the category has a real choice), price and a short
 * description.
 */
export default function BasicsStep({
  form, set, errors, categories, kind, kindOpts, onCategory, onKind, priceFrom, onPackage, editing,
}) {
  const ex = EXAMPLES[kind] || EXAMPLES.REGULAR;
  const words = PRICE_WORDS[kind] || PRICE_WORDS.REGULAR;
  const kindRef = useInvalidTarget(!!errors.kind);

  return (
    <>
      <Field label="Photos" required error={errors.images}>
        <PhotoPicker images={form.images} onChange={(imgs) => set('images', imgs)} />
      </Field>

      <Field label={kind === 'LIVESTOCK' ? 'Name of the listing' : 'Name'} required error={errors.name}>
        <PfInput
          value={form.name}
          maxLength={NAME_MAX}
          onChangeText={(v) => set('name', v)}
          placeholder={ex.name}
          autoComplete="off"
          autoCorrect={false}
        />
      </Field>

      <Field label="Category" required error={errors.categoryId}>
        <PfSelect
          value={form.categoryId}
          onChange={onCategory}
          placeholder="Choose a category"
          options={[{ value: '', label: 'Choose a category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </Field>

      {kindOpts.length > 1 ? (
        <View ref={kindRef} style={styles.field}>
          <FieldLabel label="What kind?" required />
          <RadioCards
            label="What kind?"
            options={kindOpts}
            value={kind}
            onChange={onKind}
            invalid={!!errors.kind}
          />
          <FieldError text={errors.kind} />
        </View>
      ) : null}

      <Field label={words.label} required error={errors.price} hint={priceFrom ? null : words.hint}>
        {priceFrom ? (
          <View style={derivedStyles.box} accessibilityLiveRegion="polite">
            <Text style={derivedStyles.strong}>
              {priceFrom.span
                ? `${priceFrom.span.min === priceFrom.span.max ? '' : 'from '}${peso(priceFrom.span.min)}`
                : 'Set a price for each one'}
            </Text>
            <Text style={derivedStyles.small}>{priceFrom.text}</Text>
          </View>
        ) : (
          <MoneyInput value={form.price} onChange={(v) => set('price', v)} placeholder={ex.price} invalid={!!errors.price} />
        )}
      </Field>

      <Field
        label="Description"
        required
        error={errors.description}
        aside={form.description.length > DESCRIPTION_MAX - 200 ? `${form.description.length}/${DESCRIPTION_MAX}` : null}
      >
        <PfInput
          multiline
          maxLength={DESCRIPTION_MAX}
          value={form.description}
          onChangeText={(v) => set('description', v)}
          placeholder={ex.description}
        />
      </Field>

      {!editing ? (
        <Pressable accessibilityRole="button" onPress={onPackage} style={styles.pkg}>
          <PackageIcon size={18} color={PF.green} />
          <Text style={styles.pkgText}>
            Selling several products as one set? <Text style={styles.pkgStrong}>Create a package</Text>
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  field: { gap: 6, minWidth: 0 },
  // .pf-package-hint: one quiet line at the end of Basics.
  pkg: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 44, marginTop: 2,
    paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: PF.line,
  },
  pkgText: { flexShrink: 1, fontSize: 13.5, lineHeight: 21.6, color: PF.muted, ...font(400) },
  pkgStrong: { color: PF.greenDark, ...font(700) },
}));

