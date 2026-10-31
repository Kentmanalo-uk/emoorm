import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon, DeviceMobileIcon, MoonIcon, SunIcon } from '../../lib/icons';
import useThemeStore, { THEME_CHOICES, useSystemScheme } from '../../store/themeStore';
import { font, t, themed } from '../../theme';

/*
 * Settings → Accessibility: light, dark, or whatever the phone is set to.
 *
 * The choice takes effect on the tap and is remembered on this phone. Each
 * row says what it does rather than only naming it, because "Follow my
 * phone" is not obvious on its own.
 */

const ICONS = { system: DeviceMobileIcon, light: SunIcon, dark: MoonIcon };

export default function AppearanceRows() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  // The phone's own setting, not the one in use: this row says which way
  // following the phone would land, even while Light or Dark is chosen.
  const phone = useSystemScheme();

  return (
    <View style={styles.list}>
      {THEME_CHOICES.map((choice, i) => {
        const Icon = ICONS[choice.key];
        const on = preference === choice.key;
        // Only the "follow" row needs to say which way it is leaning.
        const hint = choice.key === 'system'
          ? `${choice.hint} — ${phone === 'dark' ? 'dark right now' : 'light right now'}`
          : choice.hint;
        return (
          <Pressable
            key={choice.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${choice.label}. ${hint}`}
            onPress={() => setPreference(choice.key)}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            <View style={[styles.icon, on && styles.iconOn]}>
              <Icon size={20} weight="fill" color={on ? t.primary[700] : t.neutral[900]} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{choice.label}</Text>
              <Text style={styles.hint}>{hint}</Text>
            </View>
            {on ? <CheckIcon size={18} weight="bold" color={t.primary[600]} /> : <View style={styles.spacer} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { backgroundColor: t.neutral[0], borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.neutral[200] },
  pressed: { backgroundColor: t.neutral[50] },
  icon: {
    width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.neutral[100],
  },
  iconOn: { backgroundColor: t.primary[100] },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 15, lineHeight: 20, color: t.neutral[900], ...font(500) },
  labelOn: { color: t.primary[700], ...font(600) },
  hint: { fontSize: 12.5, lineHeight: 17, color: t.neutral[500], ...font(400) },
  spacer: { width: 18 },
}));
