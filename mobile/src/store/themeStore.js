import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Light, dark, or whatever the phone is set to (Settings → Accessibility).
 *
 * `preference` is what the person chose and is all that is remembered on the
 * phone; what the phone itself is set to is read fresh from React Native
 * (useSystemScheme), never stored, so it cannot go stale.
 */
export const THEME_CHOICES = [
  { key: 'system', label: 'Follow my phone', hint: 'Match the phone\'s own light or dark setting' },
  { key: 'light', label: 'Light', hint: 'Always light' },
  { key: 'dark', label: 'Dark', hint: 'Easier on the eyes at night, and uses less battery on OLED screens' },
];

const useThemeStore = create(
  persist(
    (set) => ({
      preference: 'system',
      hydrated: false,

      setPreference: (preference) => set({ preference }),
    }),
    {
      name: 'emoorm-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => { if (state) state.hydrated = true; },
    }
  )
);

/**
 * 'light' or 'dark' — what the phone itself is set to, whatever was chosen
 * here. Only the "Follow my phone" row needs this, to say which way that
 * row is leaning; everything else wants useResolvedScheme.
 */
export const useSystemScheme = () => (useColorScheme() === 'dark' ? 'dark' : 'light');

/**
 * 'light' or 'dark' — the choice, or the phone's own setting when following
 * it. Re-renders the caller when either changes, so anything that must match
 * the palette (the status bar, a map's style) can read it straight.
 */
export const useResolvedScheme = () => {
  const phone = useSystemScheme();
  const preference = useThemeStore((s) => s.preference);
  if (preference === 'light' || preference === 'dark') return preference;
  return phone;
};

export default useThemeStore;
