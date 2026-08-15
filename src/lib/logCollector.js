const LOG_LIMIT = 100;
const logs = [];

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const captureLog = (type, args) => {
  const timestamp = new Date().toISOString();
  try {
    const message = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return '[Unserializable Object]';
        }
      }
      return String(arg);
    }).join(' ');
    
    logs.push({ timestamp, type, message });
    if (logs.length > LOG_LIMIT) {
      logs.shift();
    }
  } catch (e) {
    originalError.apply(console, ["[LogCollector Error]", e]);
  }
};

console.log = (...args) => {
  captureLog('log', args);
  originalLog.apply(console, args);
};

console.warn = (...args) => {
  captureLog('warn', args);
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  captureLog('error', args);
  originalError.apply(console, args);
};

export const getCapturedLogs = () => {
  return [...logs];
};
