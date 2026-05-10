const express = require("express");
const axios = require("axios");
const auth = require("../middleware/auth.js");

const router = express.Router();

const TEMPLATE_NAME = "pendingtask";
const WA_API_BASE = "https://graph.facebook.com/v18.0";

// Validates a phone number: must be 10 or 12 digits
function validatePhone(phone) {
  const clean = String(phone).replace(/\D/g, "");
  if (clean.length === 10) return `91${clean}`;
  if (clean.length === 12) return clean;
  return null;
}

// S4 — shared validation for send-checklist and send-delegation
function validateTaskBody(body, listKey) {
  const { number, employeeName } = body;
  const list = body[listKey];

  if (!number || !employeeName || !list || !Array.isArray(list)) {
    return { ok: false, msg: `Missing fields or ${listKey} must be an array` };
  }
  if (typeof employeeName !== "string" || employeeName.trim().length === 0 || employeeName.length > 100) {
    return { ok: false, msg: "Invalid employeeName" };
  }
  const phone = validatePhone(number);
  if (!phone) return { ok: false, msg: "Invalid phone number — must be 10 or 12 digits" };
  if (list.length === 0) return { ok: false, msg: `${listKey} array must not be empty` };
  if (list.some(item => typeof item !== "string")) {
    return { ok: false, msg: `All ${listKey} items must be strings` };
  }
  return { ok: true, phone };
}

router.post("/send-checklist", auth, async (req, res) => {
  const validation = validateTaskBody(req.body, "tasks");
  if (!validation.ok) {
    return res.status(400).json({ success: false, message: validation.msg });
  }

  const { employeeName } = req.body;
  const { tasks } = req.body;

  let taskListStr = tasks
    .map((task, index) => `${index + 1}️⃣ ${task}`)
    .join("\n");

  if (taskListStr.length > 1000) taskListStr = taskListStr.slice(0, 1000) + "...";

  try {
    const response = await axios.post(
      `${WA_API_BASE}/${process.env.META_WA_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: validation.phone,
        type: "template",
        template: {
          name: TEMPLATE_NAME,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: employeeName.trim() },
                { type: "text", text: String(tasks.length) },
                { type: "text", text: taskListStr },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.META_WA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ success: true, message: "WhatsApp checklist sent", data: response.data });
  } catch (error) {
    console.error("WhatsApp checklist send error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "WhatsApp checklist send failed", error: error.response?.data || error.message });
  }
});

router.post("/send-delegation", auth, async (req, res) => {
  const validation = validateTaskBody(req.body, "delegations");
  if (!validation.ok) {
    return res.status(400).json({ success: false, message: validation.msg });
  }

  const { employeeName, delegations } = req.body;

  let delegationListStr = delegations
    .map((d, index) => `${index + 1}️⃣ ${d}`)
    .join("\n");

  if (delegationListStr.length > 1000) delegationListStr = delegationListStr.slice(0, 1000) + "...";

  try {
    const response = await axios.post(
      `${WA_API_BASE}/${process.env.META_WA_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: validation.phone,
        type: "template",
        template: {
          name: TEMPLATE_NAME,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: employeeName.trim() },
                { type: "text", text: String(delegations.length) },
                { type: "text", text: delegationListStr },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.META_WA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ success: true, message: "WhatsApp delegation sent", data: response.data });
  } catch (error) {
    console.error("WhatsApp delegation send error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "WhatsApp delegation send failed", error: error.response?.data || error.message });
  }
});

// ======================================================
// S1 — BULK REPORT (previously called directly from frontend)
// Accepts pre-computed per-employee data; sends WA messages server-side
// ======================================================
router.post("/send-bulk-report", auth, async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: "messages must be a non-empty array" });
  }

  const PHONE_ID = process.env.META_WA_PHONE_ID;
  const TOKEN = process.env.META_WA_TOKEN;

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const results = [];

  for (let i = 0; i < messages.length; i++) {
    const { phone, name, weekRange, delOverall, woOverall, var5, var6 } = messages[i];

    // S4 — validate each message item
    const cleanPhone = validatePhone(phone);
    if (!cleanPhone) {
      results.push({ name, status: 'skipped', reason: 'invalid phone' });
      continue;
    }
    if (!name || typeof name !== "string") {
      results.push({ name, status: 'skipped', reason: 'invalid name' });
      continue;
    }

    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: "workreport",
        language: { code: "en" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: String(name) },
            { type: "text", text: String(weekRange || "") },
            { type: "text", text: String(delOverall || "0") },
            { type: "text", text: String(woOverall || "0") },
            { type: "text", text: String(var5 || "") },
            { type: "text", text: String(var6 || "") },
          ],
        }],
      },
    };

    try {
      await axios.post(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, payload, {
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      });
      results.push({ name, status: 'sent' });
    } catch (err) {
      results.push({ name, status: 'failed', reason: err.response?.data || err.message });
    }

    if (i < messages.length - 1) await delay(2000);
  }

  return res.json({ success: true, results });
});

module.exports = router;
