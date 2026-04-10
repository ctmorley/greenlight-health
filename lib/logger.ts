/**
 * Structured JSON Logger
 *
 * Lightweight structured logger that outputs JSON to stdout/stderr.
 * Azure App Service captures stdout automatically. No external dependency.
 *
 * Usage:
 *   import { log } from "@/lib/logger";
 *   log.info("PA submitted", { requestId, userId, route: "/api/fhir/submit-pa" });
 *   log.error("Submission failed", { requestId, error: err.message });
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
