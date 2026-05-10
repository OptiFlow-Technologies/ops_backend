const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getSheets } = require("../googleSheetsClient");
const { parseDDMMYYYY } = require("../utils/date");
const { DELEGATION: D, CHECKLIST: CH, TICKET: T } = require("../utils/columns");
const cache = require("../utils/cache");

const EMPLOYEE_CACHE_KEY = "employees";
const EMPLOYEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ===================== HELPERS ===================== */

function percent(part, total) {
  return total ? ((part / total) * 100).toFixed(2) : "0.00";
}

function calculate80_20(pendingPercent, delayPercent) {
  return (Number(pendingPercent) * 0.8 + Number(delayPercent) * 0.2).toFixed(2);
}

function getWeekRange(month, week) {
  const year = new Date().getFullYear();
  const m = Number(month) - 1;
  let weekStart, weekEnd;

  if (week === "all") {
    weekStart = new Date(year, m, 1);
    weekStart.setHours(0, 0, 0, 0);
    weekEnd = new Date(year, m + 1, 0);
    weekEnd.setHours(23, 59, 59, 999);
  } else {
    const firstDay = new Date(year, m, 1);
    const dow = firstDay.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const firstMonday = new Date(year, m, 1 + diff);

    weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
    weekStart.setHours(0, 0, 0, 0);

    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
  }

  return { weekStart, weekEnd };
}

/* ===================== CALCULATORS ===================== */

function delegationCalc(rows, name, weekStart, weekEnd) {
  const empName = name.trim().toLowerCase();
  let total = 0, completed = 0, pending = 0, onTime = 0, delayed = 0;

  rows.forEach(r => {
    if ((r[D.NAME]?.trim().toLowerCase() || "") !== empName) return;

    const created = parseDDMMYYYY(r[D.CREATED_DATE]);
    const deadline = parseDDMMYYYY(r[D.DEADLINE]);
    const done = r[D.FINAL_DATE] ? parseDDMMYYYY(r[D.FINAL_DATE]) : null;

    if (!created) return;
    if (!(created <= weekEnd && (!done || done >= weekStart))) return;

    total++;
    if (done && done >= weekStart && done <= weekEnd) {
      completed++;
      if (deadline && done <= deadline) onTime++;
      else delayed++;
    } else {
      pending++;
    }
  });

  return {
    totalWork: total,
    completedWork: completed,
    pendingWork: pending,
    onTimeWork: onTime,
    pendingPercent: percent(pending, total),
    delayPercent: percent(delayed, completed),
  };
}

function checklistCalc(rows, name, weekStart, weekEnd) {
  const empName = name.trim().toLowerCase();
  let total = 0, completed = 0, pending = 0, onTime = 0, delayed = 0;

  rows.forEach(r => {
    if ((r[CH.NAME]?.trim().toLowerCase() || "") !== empName) return;

    const planned = parseDDMMYYYY(r[CH.PLANNED]);
    const actual  = parseDDMMYYYY(r[CH.ACTUAL]);

    const inRange =
      (planned && planned >= weekStart && planned <= weekEnd) ||
      (actual  && actual  >= weekStart && actual  <= weekEnd);

    if (!inRange) return;

    total++;
    if (actual) {
      completed++;
      if (planned && actual <= planned) onTime++;
      else delayed++;
    } else {
      pending++;
    }
  });

  return {
    totalWork: total,
    completedWork: completed,
    pendingWork: pending,
    onTimeWork: onTime,
    pendingPercent: percent(pending, total),
    delayPercent: percent(delayed, completed),
  };
}

function ticketCalc(rows, name, weekStart, weekEnd) {
  const empName = name.trim().toLowerCase();
  let total = 0, completed = 0, pending = 0, onTime = 0, delayed = 0;

  rows.forEach(r => {
    if ((r[T.ASSIGNED_TO]?.trim().toLowerCase() || "") !== empName) return;

    const created = parseDDMMYYYY(r[T.CREATED_DATE]);
    const done    = parseDDMMYYYY(r[T.DONE_DATE]);
    if (!created) return;
    if (!(created <= weekEnd && (!done || done >= weekStart))) return;

    total++;
    if (done && done >= weekStart && done <= weekEnd) {
      completed++;
      const days = Math.ceil((done - created) / (1000 * 60 * 60 * 24));
      if (days <= 3) onTime++;
      else delayed++;
    } else {
      pending++;
    }
  });

  return {
    totalWork: total,
    completedWork: completed,
    pendingWork: pending,
    onTimeWork: onTime,
    pendingPercent: percent(pending, total),
    delayPercent: percent(delayed, completed),
  };
}

function ticketCalcCreated(rows, name, weekStart, weekEnd) {
  const empName = name.trim().toLowerCase();
  let total = 0, completed = 0, pending = 0, onTime = 0, delayed = 0;

  rows.forEach(r => {
    if ((r[T.CREATED_BY]?.trim().toLowerCase() || "") !== empName) return;

    const created = parseDDMMYYYY(r[T.CREATED_DATE]);
    const done    = parseDDMMYYYY(r[T.DONE_DATE]);
    if (!created) return;
    if (!(created <= weekEnd && (!done || done >= weekStart))) return;

    total++;
    if (done && done >= weekStart && done <= weekEnd) {
      completed++;
      const days = Math.ceil((done - created) / (1000 * 60 * 60 * 24));
      if (days <= 3) onTime++;
      else delayed++;
    } else {
      pending++;
    }
  });

  return {
    totalWork: total,
    completedWork: completed,
    pendingWork: pending,
    onTimeWork: onTime,
    pendingPercent: percent(pending, total),
    delayPercent: percent(delayed, completed),
  };
}

/* ===================== API ===================== */

router.get("/all-dashboard", auth, async (req, res) => {
  try {
    const { month, week, selectedName } = req.query;
    if (!month || !week) {
      return res.status(400).json({ error: "Month & Week required" });
    }

    const sheets = await getSheets();
    const { weekStart, weekEnd } = getWeekRange(month, week);

    // P1 — employee list from cache; fall back to Sheets fetch if stale/missing
    let employees = cache.get(EMPLOYEE_CACHE_KEY);
    let empFetchPromise = null;

    if (!employees) {
      empFetchPromise = sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: "Employee!A2:L",
      });
    }

    // P2 — fetch all data sheets concurrently (not sequentially)
    const [delegationRes, checklistRes, helpRes, supportRes, empResIfNeeded] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID_DELEGATION,
        range: "DelegationMaster!A2:R",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID_CHECKLIST,
        range: "Master!A2:K",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID_HELPTICKET,
        range: "HelpTicketsMaster!A2:H",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID_SUPPORTTICKET,
        range: "SupportTicketsMaster!A2:H",
      }),
      empFetchPromise || Promise.resolve(null),
    ]);

    if (empResIfNeeded) {
      employees = (empResIfNeeded.data.values || []).map(e => ({
        name: e[1]?.trim(),
        key: e[1]?.trim().toLowerCase(),
      }));
      cache.set(EMPLOYEE_CACHE_KEY, employees, EMPLOYEE_CACHE_TTL);
    }

    const delegationRows = delegationRes.data.values || [];
    const checklistRows  = checklistRes.data.values  || [];
    const helpRows       = helpRes.data.values        || [];
    const supportRows    = supportRes.data.values     || [];

    let filteredEmployees = employees;
    if (selectedName && selectedName !== "all") {
      filteredEmployees = employees.filter(e => e.key === selectedName.trim().toLowerCase());
    }

    const data = filteredEmployees.map(emp => {
      const nameKey = emp.key;

      const delegation    = delegationCalc(delegationRows,  nameKey, weekStart, weekEnd);
      const checklist     = checklistCalc(checklistRows,    nameKey, weekStart, weekEnd);
      const helpAssigned  = ticketCalc(helpRows,            nameKey, weekStart, weekEnd);
      const helpCreated   = ticketCalcCreated(helpRows,     nameKey, weekStart, weekEnd);
      const suppAssigned  = ticketCalc(supportRows,         nameKey, weekStart, weekEnd);
      const suppCreated   = ticketCalcCreated(supportRows,  nameKey, weekStart, weekEnd);

      const totalWork =
        delegation.totalWork + checklist.totalWork +
        helpAssigned.totalWork + suppAssigned.totalWork;

      const totalCompleted =
        delegation.completedWork + checklist.completedWork +
        helpAssigned.completedWork + suppAssigned.completedWork;

      const totalPending =
        delegation.pendingWork + checklist.pendingWork +
        helpAssigned.pendingWork + suppAssigned.pendingWork;

      const totalOnTime =
        delegation.onTimeWork + checklist.onTimeWork +
        helpAssigned.onTimeWork + suppAssigned.onTimeWork;

      const pendingPercent = percent(totalPending, totalWork);

      const delayPercent = (
        Number(delegation.delayPercent) +
        Number(checklist.delayPercent) +
        Number(helpAssigned.delayPercent) +
        Number(suppAssigned.delayPercent)
      ) / 4;

      return {
        name: emp.name,
        delegation,
        checklist,
        helpTicket: {
          assigned: helpAssigned,
          created:  helpCreated,
        },
        supportTicket: {
          assigned: suppAssigned,
          created:  suppCreated,
        },
        overall: {
          totalWork,
          totalCompleted,
          totalPending,
          totalOnTime,
          pendingPercent,
          delayPercent: delayPercent.toFixed(2),
          overallScore: calculate80_20(pendingPercent, delayPercent),
        },
      };
    });

    res.json({
      weekStart: weekStart.toLocaleDateString("en-CA"),
      weekEnd:   weekEnd.toLocaleDateString("en-CA"),
      data,
    });
  } catch (err) {
    console.error("ALL DASHBOARD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
