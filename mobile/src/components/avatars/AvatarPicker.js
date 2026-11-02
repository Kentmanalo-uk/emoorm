import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, XIcon } from '../../lib/icons';
import Avatar from './Avatar';
import { AVATARS } from './avatars';
import { font, t, themed } from '../../theme';

/**
 * Pick one of the twenty, instead of a photo.
 *
 * Opens over the profile screen, four across. The one in use is ringed;
 * tapping another chooses it and closes -- there is no Save here, because
 * the screen underneath already has one and two Saves in a row is one
 * too many.
 *
 * `current` may be null, which is the ordinary case: the person has never
 * picked and is being shown the avatar their id works out to. The sheet
 * rings that one, so what they see here matches what they see everywhere
 * else.
 *
 * @param {String|null} current - the chosen key
 * @param {String} seed - the account id, for working out the default
 */
export default function AvatarPicker({ current, seed, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">Pick an avatar</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={styles.close}>
            <XIcon size={20} color={t.neutral[600]} />
          </Pressable>
        </View>
        <Text style={styles.note}>Used when you have no photo.</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {AVATARS.map((spec) => {
            const on = current === spec.key;
            return (
              <Pressable
                key={spec.key}
                accessibilityRole="button"
                accessibilityLabel={`Avatar ${spec.key}`}
                accessibilityState={{ selected: on }}
                onPress={() => onPick(spec.key)}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              >
                <View style={[styles.ring, on && styles.ringOn]}>
                  <Avatar name={spec.key} seed={seed} size={62} />
                </View>
                {on ? (
                  <View style={styles.tick}><CheckIcon size={12} weight="bold" color={t.onBrand} /></View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%',
    paddingTop: 14, paddingHorizontal: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    backgroundColor: t.neutral[0],
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, lineHeight: 22, color: t.neutral[900], ...font(600) },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: 2, marginBottom: 14, fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(400) },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 8 },
  cell: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  cellPressed: { opacity: 0.7 },
  ring: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: t.primary[600] },
  tick: {
    position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
    borderWidth: 2, borderColor: t.neutral[0],
  },
}));
