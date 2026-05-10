// P1 — Simple in-memory TTL cache (single-process only; acceptable for this stack)
const _store = new Map();

function set(key, value, ttlMs) {
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function get(key) {
  const entry = _store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    return null;
  }
  return entry.value;
}

function del(key) {
  _store.delete(key);
}

module.exports = { get, set, del };
