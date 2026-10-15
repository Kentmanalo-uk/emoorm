import {
  createContext, useCallback, useContext, useMemo, useRef,
} from 'react';

/*
 * Bring a view inside a ScrollView into sight, from deep in the tree (the
 * inline panels of "Delivery places and fees" scroll themselves to the top
 * when they open, as the website's scrollIntoView). The screen that owns the
 * ScrollView:
 *
 *   const { reveal, contentProps } = useScrollReveal(scrollRef);
 *   <ScrollView ref={scrollRef}>
 *     <View {...contentProps}>
 *       <ScrollRevealContext.Provider value={reveal}>…</ScrollRevealContext.Provider>
 *     </View>
 *   </ScrollView>
 *
 * and a view inside: const reveal = useReveal(); reveal(node, margin).
 */

export const ScrollRevealContext = createContext(null);

export function useScrollReveal(scrollRef) {
  const contentRef = useRef(null);
  const top = useRef(0);
  const reveal = useCallback((node, margin = 12) => {
    if (!node?.measureLayout || !contentRef.current) return;
    node.measureLayout(contentRef.current, (x, y) => {
      scrollRef.current?.scrollTo({ y: Math.max(0, top.current + y - margin), animated: true });
    }, () => {});
  }, [scrollRef]);
  const contentProps = useMemo(() => ({
    ref: contentRef,
    collapsable: false,
    onLayout: (e) => { top.current = e.nativeEvent.layout.y; },
  }), []);
  return { reveal, contentProps };
}

/** reveal(node, margin) of the nearest screen that offers it (or null). */
export const useReveal = () => useContext(ScrollRevealContext);
