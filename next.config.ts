import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the existing static files to be served from public/
  // The landing page is served via a route handler at /

  // ─── Security Headers (HIPAA / SOC 2 / HITRUST) ─────────────
  headers: async () => [
    // ─── Global security headers (all routes) ──────────────────
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
      ],
    },
    // ─── Strict CSP for app routes (PHI) ───────────────────────
    {
      source: "/app/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://*.fhir.org https://launch.smarthealthit.org https://hapi.fhir.org",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ],
    },
    // ─── Strict CSP for API routes ─────────────────────────────
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "default-src 'none'; frame-ancestors 'none'",
        },
      ],
    },
    // CORS for CDS Hooks endpoints (must be cross-origin accessible)
    {
      source: "/api/cds-hooks/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
      ],
    },
  ],

  // ─── Output Configuration for Azure App Service ──────────────
  output: "standalone",
};

export default nextConfig;
