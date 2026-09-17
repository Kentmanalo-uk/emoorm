import axios from './axios';

const BOM = String.fromCharCode(0xfeff);

const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Download rows as a CSV file.
 * @param {String} filename - e.g. "sellers.csv"
 * @param {Array<{header: String, value: (row) => any}>} columns
 * @param {Array<Object>} rows
 */
export function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(',')),
  ];
  // BOM so Excel opens UTF-8 (₱, ñ) correctly.
  const blob = new Blob([`${BOM}${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Fetch every page of a paginated admin list (API caps pageSize at 100).
 * @param {String} url
 * @param {Object} params - filters to keep (page/pageSize are managed here)
 * @param {Number} [maxRows=5000] - safety cap
 */
export async function fetchAllPages(url, params = {}, maxRows = 5000) {
  const rows = [];
  let page = 1;
  for (;;) {
    const res = await axios.get(url, { params: { ...params, page, pageSize: 100 } });
    rows.push(...(res.data || []));
    const totalPages = res.pagination?.totalPages || 1;
    if (page >= totalPages || rows.length >= maxRows) break;
    page += 1;
  }
  return rows.slice(0, maxRows);
}

export const csvDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
