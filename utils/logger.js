const logger = {
  info: (msg, data = {}) =>
    console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...data })),
  warn: (msg, data = {}) =>
    console.warn(JSON.stringify({ level: 'warn', time: new Date().toISOString(), msg, ...data })),
  error: (msg, data = {}) =>
    console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), msg, ...data })),
};

module.exports = logger;
