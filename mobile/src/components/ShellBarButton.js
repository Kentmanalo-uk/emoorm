import { forwardRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { t } from '../theme';

/**
 * A plain icon button for a page's top bar (web phone-app.css "Plain icons:
 * the bar is their background"): 40px round, no fill until pressed.
 * Give the icon its own colour (the website's bar icons are t.neutral[700]).
 */
const ShellBarButton = forwardRef(function ShellBarButton({ label, onPress, disabled, children, style, ...rest }, ref) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      {...rest}
    >
      {children}
    </Pressable>
  );
});

export default ShellBarButton;

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pressed: { backgroundColor: t.neutral[100] },
});
