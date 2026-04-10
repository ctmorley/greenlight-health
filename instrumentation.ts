/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the server starts. Initializes Azure Application Insights
 * for request tracing, exception tracking, and custom event telemetry.
 *
 * Only activates when APPLICATIONINSIGHTS_CONNECTION_STRING is set.
 * In development, this file is a no-op.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

    if (!connectionString) {
      console.log("[INSTRUMENTATION] Application Insights not configured — skipping.");
      return;
    }

    try {
      const { useAzureMonitor } = await import("@azure/monitor-opentelemetry");

      useAzureMonitor({
        azureMonitorExporterOptions: {
          connectionString,
        },
        instrumentationOptions: {
          http: { enabled: true },
        },
      });

      console.log("[INSTRUMENTATION] Application Insights initialized.");
    } catch (err) {
      // Don't crash the server if App Insights fails to load
      console.error("[INSTRUMENTATION] Failed to initialize Application Insights:", err);
    }
  }
}
