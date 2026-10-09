/**
 * Today, Yesterday, This week, Earlier: the heading a dated row is listed
 * under, so long lists (notifications) read by day.
 */
export const dayGroupOf = (iso) => {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (d >= start) return 'Today';
  if (d >= start - day) return 'Yesterday';
  if (d >= start - 6 * day) return 'This week';
  return 'Earlier';
};

/** Consecutive rows under their day heading: [{ label, items }]. */
export const groupByDay = (rows, dateOf = (r) => r.createdAt) => {
  const groups = [];
  for (const row of rows) {
    const label = dayGroupOf(dateOf(row));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }
  return groups;
};
