import { FlatList, Platform, ScrollView } from 'react-native';
import useBrandRefresh from './useBrandRefresh';

/**
 * A ScrollView or FlatList with the app's pull to refresh built in: use it
 * in place of the plain one and give it `onPull`.
 *
 *   <PullScrollView onPull={load} style={…}>…</PullScrollView>
 *
 * onPull may return a promise, and the disc spins until it settles. A screen
 * whose reload only flips a `refreshing` state passes that too, and the disc
 * waits for it to go false.
 *
 * It renders the list and the disc side by side, so nothing around it has to
 * change. The list's own onScroll and onLayout still run.
 */
function pullable(List) {
  return function Pullable({
    onPull, refreshing, onScroll, onLayout, scrollEventThrottle, ...rest
  }) {
    const pull = useBrandRefresh(onPull, { refreshing });
    const ios = Platform.OS === 'ios';
    // An Animated.event is not a function, and is left to do its own work.
    const plainScroll = !onScroll || typeof onScroll === 'function';
    const scrollProps = ios && plainScroll
      ? {
        onScroll: (e) => { pull.trackPull(e); onScroll?.(e); },
        scrollEventThrottle: Math.min(scrollEventThrottle ?? 32, 32),
      }
      : { onScroll, scrollEventThrottle };

    return (
      <>
        <List
          {...rest}
          {...scrollProps}
          refreshControl={pull.listProps.refreshControl}
          onLayout={(e) => { pull.listProps.onLayout(e); onLayout?.(e); }}
        />
        {pull.indicator}
      </>
    );
  };
}

export const PullScrollView = pullable(ScrollView);
export const PullFlatList = pullable(FlatList);
