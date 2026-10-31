import { forwardRef } from 'react';
import { StyleSheet } from 'react-native';
import { themed } from '../../../theme';
import { DESCRIPTION_MAX } from './pkfLib';
import { Field, PkfInput, Section } from './PkfBits';
import PackagePhotos from './PackagePhotos';

/*
 * Step 3 · Photo and description (web PackageForm.jsx shows(3)): both
 * optional; left empty, buyers see the items' photos and "Includes: …".
 */
const PhotoStep = forwardRef(function PhotoStep({
  form, errors, set, itemPhotos, autoDescription,
}, ref) {
  return (
    <Section
      ref={ref}
      title="Photo and description"
      tag="Optional"
      hint="Skip this and buyers see your items' photos and a list of what's inside."
      invalid={!!errors.description}
    >
      <Field label="Package photo" tag="Optional">
        <PackagePhotos images={form.images} itemPhotos={itemPhotos} onChange={(imgs) => set('images', imgs)} />
      </Field>
      <Field
        label="Description"
        tag="Optional"
        error={errors.description}
        aside={`${form.description.length}/${DESCRIPTION_MAX}`}
        hint={autoDescription ? `Leave it empty and buyers see: "${autoDescription}"` : null}
      >
        <PkfInput
          multiline
          value={form.description}
          maxLength={DESCRIPTION_MAX}
          onChangeText={(v) => set('description', v)}
          placeholder="e.g. Good for 15 to 20 people. Perfect for birthdays and fiestas."
          error={!!errors.description}
          style={styles.textarea}
        />
      </Field>
    </Section>
  );
});

export default PhotoStep;

const styles = themed(() => StyleSheet.create({
  // rows={4}: 4 lines × 24px + 10px padding top and bottom + the hairlines.
  textarea: { minHeight: 118 },
}));
