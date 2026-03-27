import { prisma } from "@/lib/prisma";

/**
 * Generate a unique reference number in the format GL-YYYYMMDD-XXXXX.
 * Uses a sequential counter scoped to the current date.
 */
export async function generateReferenceNumber(): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `GL-${dateStr}-`;

  // Find the highest reference number for today
  const latest = await prisma.priorAuthRequest.findFirst({
    where: {
      referenceNumber: { startsWith: prefix },
    },
    orderBy: { referenceNumber: "desc" },
    select: { referenceNumber: true },
  });

  let nextNum = 1;
  if (latest) {
    const lastNum = parseInt(latest.referenceNumber.slice(prefix.length), 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(5, "0")}`;
}
