import { prisma } from "../../lib/prisma";

/**
 * Receipt numbers look like `RCT-2026-000123`, sequential within a year.
 *
 * Two people recording contributions at the same instant could both read the
 * same "highest so far" and generate a duplicate. The unique constraint on
 * `receiptNumber` turns that into a P2002 rather than a silent collision, so
 * we retry a few times before giving up.
 */
export const nextReceiptNumber = async (receivedOn: Date): Promise<string> => {
  const year = receivedOn.getUTCFullYear();
  const prefix = `RCT-${year}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await prisma.contribution.findFirst({
      where: { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: "desc" },
      select: { receiptNumber: true },
    });

    const lastSeq = latest ? Number.parseInt(latest.receiptNumber.slice(prefix.length), 10) : 0;
    const candidate = `${prefix}${String(lastSeq + 1 + attempt).padStart(6, "0")}`;

    const taken = await prisma.contribution.findUnique({
      where: { receiptNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // Fall back to a timestamp-suffixed number rather than failing the recording.
  return `${prefix}${Date.now().toString().slice(-6)}`;
};
