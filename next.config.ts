import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the existing static files to be served from public/
  // The landing page is served via a route handler at /

  // ─── Security Headers (HIPAA / SOC 2 / HITRUST) ─────────────
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        // Prevent clickjacking (HITRUST 09.s)
        { key: "X-Frame-Options", value: "DENY" },
        // Prevent MIME sniffing
        { key: "X-Content-Type-Options", value: "nosniff" },
        // Enable HSTS (SOC 2 CC6.7)
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // Referrer policy — don't leak PHI in referrer headers
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Permissions policy — disable unnecessary browser features
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=()",
        },
        // XSS protection (legacy browsers)
        { key: "X-XSS-Protection", value: "1; mode=block" },
        // Content Security Policy
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
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
