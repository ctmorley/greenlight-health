import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

let cachedHtml: string | null = null;

export async function GET() {
  try {
    if (!cachedHtml) {
      const filePath = join(process.cwd(), "public", "index.html");
      cachedHtml = await readFile(filePath, "utf-8");
    }
    return new NextResponse(cachedHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to load landing page:", error);
    return new NextResponse(
      "<html><body style=\"background:#080C14;color:#F1F5F9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h1>GreenLight</h1><p>The site is temporarily unavailable. Please try again shortly.</p></div></body></html>",
      {
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}
