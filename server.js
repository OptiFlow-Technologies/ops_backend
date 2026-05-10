const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require('path');
const rateLimit = require('express-rate-limit');

dotenv.config();

// ======================================================
// D6 — ENV VAR VALIDATION ON STARTUP
// ======================================================
const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'GOOGLE_SHEET_ID',
  'GOOGLE_SHEET_ID_CHECKLIST',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'META_WA_PHONE_ID',
  'META_WA_TOKEN',
];

const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(JSON.stringify({
    level: 'error',
    time: new Date().toISOString(),
    msg: 'Missing required environment variables — server cannot start',
    missing: missingVars,
  }));
  process.exit(1);
}

const logger = require('./utils/logger');

const app = express();

// ======================================================
// S3 — CORS LOCKED TO ALLOWED ORIGINS
// ======================================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());

// Profile pictures static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================================================
// S2 — RATE LIMITING
// ======================================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/adminauth/admin/login', authLimiter);

// ======================================================
// ROUTES
// ======================================================
const authRoutes = require("./routes/auth");
const adminAuth = require("./routes/adminAuth");
const delegationsRoutes = require("./routes/delegations");
const supportTicketsRoutes = require("./routes/supportTickets");
const checklistRoutes = require("./routes/checklist");
const employeeRouter = require("./routes/employee");
const helpTicketsRouter = require("./routes/helpTickets");
const additionalFeature = require("./routes/additionalFeature");
const allDashboard = require('./routes/allDashboard');
const whatsappRoutes = require("./routes/whatsapp.js");

const errorHandler = require('./middleware/errorHandler');

app.use("/api/auth", authRoutes);
app.use("/api/adminauth", adminAuth);
app.use("/api/additionalfeature", additionalFeature);
app.use("/api/delegations", delegationsRoutes);
app.use("/api/support-tickets", supportTicketsRoutes);
app.use("/api/checklist", checklistRoutes);
app.use("/api/employee", employeeRouter);
app.use("/api/helpTickets", helpTicketsRouter);
app.use("/api/allDashboard", allDashboard);
app.use("/api/whatsapp", whatsappRoutes);

// ======================================================
// B2 — TRACK AUTO-GENERATE VIA GOOGLE SHEETS (not file)
// ======================================================
const { getSheets } = require('./googleSheetsClient');

const isAlreadyGenerated = async () => {
  try {
    const sheets = await getSheets();
    const today = new Date();
    let targetMonth = today.getMonth() + 2;
    let targetYear = today.getFullYear();
    if (targetMonth > 12) { targetMonth = 1; targetYear++; }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID_CHECKLIST,
      range: 'GenerationLog!A2:D',
    });

    const rows = res.data.values || [];
    return rows.some(r => String(r[0]) === String(targetMonth) && String(r[1]) === String(targetYear));
  } catch (err) {
    // Conservative: allow generation if we can't check (duplicates prevented by endpoint)
    logger.warn('isAlreadyGenerated check failed, assuming not generated', { err: err.message });
    return false;
  }
};

// ======================================================
// AUTO-GENERATE FUNCTION
// ======================================================
const generateTasks = async () => {
  logger.info('Auto-generate check running');

  try {
    if (await isAlreadyGenerated()) {
      logger.info('This month already generated, skipping');
      return;
    }

    logger.info('Generating tasks for next month');

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    const response = await fetch(`${baseUrl}/api/checklist/auto-generate-next-month`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-job': 'true',
      },
    });

    const data = await response.json();

    if (response.ok) {
      logger.info('Tasks generated', { count: data.createdTasks?.length || 0 });
    } else {
      logger.error('Generation failed', { error: data.error || 'Unknown error' });
    }
  } catch (err) {
    logger.error('generateTasks error', { err: err.message });
  }
};

// ======================================================
// CRON JOB — hourly check
// ======================================================
const cron = require('node-cron');

cron.schedule('0 * * * *', () => {
  logger.info('Hourly auto-generate check triggered');
  generateTasks();
});

// ======================================================
// SERVER START
// ======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info('Server started', { port: PORT });
  setTimeout(() => { generateTasks(); }, 5000);
});

// ======================================================
// HEALTH CHECK
// ======================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
});

// ======================================================
// ADMIN MANUAL TRIGGER (no auth — internal/ops use only)
// ======================================================
app.post('/admin/generate-now', async (req, res) => {
  try {
    logger.info('Manual generate triggered');
    await generateTasks();
    res.json({ success: true, message: 'Generation triggered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// R2 — Must be last middleware registered
app.use(errorHandler);
