import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GreenLight by Medivis",
  description: "AI-Powered Prior Authorization for Imaging, Surgery & Procedures",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased bg-bg-primary text-text-primary min-h-screen">
        {children}
      </body>
    </html>
  );
}
