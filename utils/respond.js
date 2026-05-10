// R3 — Standardised response helpers
// ok(res, data)  → 200 { ok: true, ...data }
// fail(res, code, message, details) → code { ok: false, error: message, ...details }

function ok(res, data = {}) {
  return res.status(200).json({ ok: true, ...data });
}

function fail(res, statusCode, message, details = {}) {
  return res.status(statusCode).json({ ok: false, error: message, ...details });
}

module.exports = { ok, fail };
