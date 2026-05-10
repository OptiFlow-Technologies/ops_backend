const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// B4 — single canonical IST date formatter used by all routes
function formatIST(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + IST_OFFSET_MS);

  const p = (n) => String(n).padStart(2, '0');
  return `${p(ist.getDate())}/${p(ist.getMonth() + 1)}/${ist.getFullYear()} ${p(ist.getHours())}:${p(ist.getMinutes())}:${p(ist.getSeconds())}`;
}

// Parse "dd/mm/yyyy [hh:mm:ss]" → Date, returns null on failure
function parseDDMMYYYY(str) {
  if (!str) return null;
  const parts = str.split(' ')[0].split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const year = y.length === 2 ? 2000 + +y : +y;
  const date = new Date(year, +m - 1, +d);
  return isNaN(date.getTime()) ? null : date;
}

// Parse "dd/mm/yyyy hh:mm:ss" → Date (with time), returns null on failure
function parseDDMMYYYYFull(str) {
  if (!str) return null;
  const [datePart, timePart = '0:0:0'] = str.split(' ');
  const [d, m, y] = datePart.split('/');
  const [hh, mi, ss] = timePart.split(':');
  if (!d || !m || !y) return null;
  const date = new Date(+y, +m - 1, +d, +hh || 0, +mi || 0, +ss || 0);
  return isNaN(date.getTime()) ? null : date;
}

module.exports = { formatIST, parseDDMMYYYY, parseDDMMYYYYFull };
