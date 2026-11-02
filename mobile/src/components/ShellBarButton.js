import { forwardRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { t, themed } from '../theme';

/**
 * A plain icon button for a page's top bar (web phone-app.css "Plain icons:
 * the bar is their background"): 40px round, no fill until pressed. The same
 * on every phone (no glass circle on iOS). Give the icon its own colour (the
 * website's bar icons are t.neutral[700]).
 */
const ShellBarButton = forwardRef(function ShellBarButton({ label, onPress, disabled, children, style, ...rest }, ref) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      {...rest}
    >
      {children}
    </Pressable>
  );
});

export default ShellBarButton;

const styles = themed(() => StyleSheet.create({
  // 44: the icons inside are the bottom navigation's size now, and 44
  // is the smallest tap target iOS asks for.
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pressed: { backgroundColor: t.neutral[100] },
}));
