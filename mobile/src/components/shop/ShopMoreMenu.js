import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { DotsThreeIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';

const OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The shop page's ⋯ (web MoreMenu with className shop-m-more): the same
 * pop-over as the page menu, but its button takes the top bar's colour,
 * white over the cover, dark once the bar turns white.
 * items: [{ key, Icon, label, to?, onPress?, danger? }]
 */
export default function ShopMoreMenu({ items, label = 'Shop options', color = t.neutral[700], buttonStyle, iconStyle }) {
  const router = useRouter();
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [rootWidth, setRootWidth] = useState(0);
  const pop = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const shown = items.filter(Boolean);

  useEffect(() => {
    Animated.timing(spin, { toValue: expanded ? 1 : 0, duration: 260, easing: OUT, useNativeDriver: true }).start();
  }, [expanded, spin]);

  const show = () => {
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 8, end: x + w });
      pop.setValue(0);
      setOpen(true);
      setExpanded(true);
      Animated.timing(pop, { toValue: 1, duration: 220, easing: OUT, useNativeDriver: true }).start();
    });
  };

  const hide = (after) => {
    setExpanded(false);
    Animated.timing(pop, { toValue: 2, duration: 150, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setOpen(false);
    });
    after?.();
  };

  const pick = (it) => hide(() => {
    if (it.onPress) it.onPress();
    else if (it.to) router.push(it.to);
  });

  const popStyle = {
    opacity: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    transform: [
      { translateY: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [-6, 0, -4] }) },
      { scale: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1, 0.94] }) },
    ],
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <>
      <Pressable
        ref={buttonRef}
        onPress={() => (expanded ? hide() : show())}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.btn, buttonStyle, pressed && styles.btnPressed]}
      >
        <Animated.View style={[iconStyle, { transform: [{ rotate }] }]}>
          <DotsThreeIcon size={22} weight="bold" color={color} />
        </Animated.View>
      </Pressable>
      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={() => hide()}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onLayout={(e) => setRootWidth(e.nativeEvent.layout.width)}
          onPress={() => hide()}
          accessibilityLabel="Close menu"
        />
        {anchor && rootWidth ? (
          <Animated.View style={[styles.pop, { top: anchor.top, right: Math.max(0, rootWidth - anchor.end) }, popStyle]} accessibilityRole="menu">
            {shown.map((it, i) => <MenuRow key={it.key} item={it} index={i} onPress={() => pick(it)} />)}
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

function MenuRow({ item: it, index, onPress }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 240, delay: 40 + index * 35, easing: OUT, useNativeDriver: true }).start();
  }, [enter, index]);
  const color = it.danger ? t.danger[600] : t.neutral[800];
  const Icon = it.Icon;
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      <Pressable accessibilityRole="menuitem" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        {Icon ? <Icon size={17} color={color} /> : null}
        <Text style={[styles.rowText, { color }]} numberOfLines={1}>{it.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  btnPressed: { backgroundColor: t.neutral[100] },
  pop: {
    position: 'absolute',
    minWidth: 200,
    padding: 6,
    borderRadius: 14,
    backgroundColor: t.neutral[0],
    transformOrigin: 'top right',
    boxShadow: [
      { offsetX: 0, offsetY: 12, blurRadius: 32, color: 'rgba(15, 23, 42, 0.18)' },
      { offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(15, 23, 42, 0.06)' },
    ],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10 },
  rowPressed: { backgroundColor: t.neutral[100] },
  rowText: { fontSize: 14, lineHeight: 22.4, ...font(400) },
});
