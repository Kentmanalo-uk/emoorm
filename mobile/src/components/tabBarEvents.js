/*
 * Pressing a tab, across expo-router versions.
 *
 * The bottom-tabs navigator used to hand its tab bar a `navigation` object;
 * it now hands over `emitter` (to raise the tab events) and `navigateToTab`
 * (which takes the route's key) instead. A tab bar written for the old shape
 * crashes on the new one with "Cannot read property 'emit' of undefined", so
 * both bars go through here and work either way.
 */

/** Raise a tab event. Returns the event, so a caller can read defaultPrevented. */
export const emitTab = ({ emitter, navigation }, event) => {
  const bus = emitter || navigation;
  return bus ? bus.emit(event) : { defaultPrevented: false };
};

/**
 * What a tab press should do: tell anyone listening, then go there unless a
 * listener stopped it or the tab is already open.
 */
export const pressTab = (props, route, active) => {
  const event = emitTab(props, { type: 'tabPress', target: route.key, canPreventDefault: true });
  if (active || event.defaultPrevented) return;
  if (props.navigateToTab) props.navigateToTab(route.key);
  else props.navigation?.navigate(route.name, route.params);
};

/** The long press, for the bars that open the account sheet on it. */
export const longPressTab = (props, route) => emitTab(props, { type: 'tabLongPress', target: route.key });
