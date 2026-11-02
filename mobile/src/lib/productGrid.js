/*
 * The two-column product grid, wherever the app shows one: cards GRID_GAP
 * apart and GRID_EDGE from the screen's sides, so the gutter between the
 * columns matches the one at the edge.
 *
 * Headings, filters and empty states keep SECTION_EDGE. A grid sitting
 * inside a section's padding takes marginHorizontal: GRID_BLEED to reach
 * the same edge as the rest.
 */
export const GRID_EDGE = 4;
export const GRID_GAP = 4;
export const SECTION_EDGE = 12;
export const GRID_BLEED = GRID_EDGE - SECTION_EDGE;

/** One card's width on a screen this wide. Rounded down, so two always fit a row. */
export const gridCellWidth = (screenWidth) => (
  Math.floor(((screenWidth - GRID_EDGE * 2 - GRID_GAP) / 2) * 100) / 100
);
