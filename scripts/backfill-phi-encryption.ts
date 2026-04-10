/**
 * Backfill PHI Encryption
 *
 * Iterates all Patient and PatientInsurance rows, encrypting plaintext
 * fields into *Encrypted columns and computing *Hash blind indexes.
 *
 * Idempotent: skips rows that already have encrypted values.
 * Runs in batches of 100 to avoid memory issues.
 *
 * Usage: npx tsx scripts/backfill-phi-encryption.ts
 */

import { PrismaClient } from "@prisma/client";
import { encryptField, blindIndex, PATIENT_PHI_FIELDS, INSURANCE_PHI_FIELDS } from "../lib/security/phi-crypto";

const prisma = new PrismaClient();
const BATCH_SIZE = 100;

async function backfillPatients() {
  let processed = 0;
  let skipped = 0;
  let cursor: string | undefined;

  console.log("Backfilling Patient records...");

  while (true) {
    const patients = await prisma.patient.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (patients.length === 0) break;

    for (const patient of patients) {
      // Skip if already encrypted (check any encrypted column)
      if (patient.firstNameEncrypted) {
        skipped++;
        continue;
      }

      const updates: Record<string, string | null> = {};

      for (const [field, config] of Object.entries(PATIENT_PHI_FIELDS)) {
        const value = patient[field as keyof typeof patient];
        if (value === null || value === undefined) {
          updates[config.encryptedColumn] = null;
          if (config.hashColumn) updates[config.hashColumn] = null;
        } else {
          const strValue = value instanceof Date
            ? value.toISOString()
            : String(value);
          updates[config.encryptedColumn] = encryptField(strValue);
          if (config.hashColumn) {
            const normalized = config.hashNormalize
              ? config.hashNormalize(strValue)
              : strValue;
            updates[config.hashColumn] = blindIndex(normalized);
          }
        }
      }

      await prisma.patient.update({
        where: { id: patient.id },
        data: updates,
      });
      processed++;
    }

    cursor = patients[patients.length - 1].id;
    process.stdout.write(`\r  Patients: ${processed} encrypted, ${skipped} skipped`);
  }

  console.log(`\n  Done: ${processed} encrypted, ${skipped} already encrypted`);
}

async function backfillInsurances() {
  let processed = 0;
  let skipped = 0;
  let cursor: string | undefined;

  console.log("Backfilling PatientInsurance records...");

  while (true) {
    const insurances = await prisma.patientInsurance.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (insurances.length === 0) break;

    for (const ins of insurances) {
      if (ins.memberIdEncrypted) {
        skipped++;
        continue;
      }

      const updates: Record<string, string | null> = {};

      for (const [field, config] of Object.entries(INSURANCE_PHI_FIELDS)) {
        const value = ins[field as keyof typeof ins];
        if (value === null || value === undefined) {
          updates[config.encryptedColumn] = null;
          if (config.hashColumn) updates[config.hashColumn] = null;
        } else {
          const strValue = String(value);
          updates[config.encryptedColumn] = encryptField(strValue);
          if (config.hashColumn) {
            updates[config.hashColumn] = blindIndex(strValue);
          }
        }
      }

      await prisma.patientInsurance.update({
        where: { id: ins.id },
        data: updates,
      });
      processed++;
    }

    cursor = insurances[insurances.length - 1].id;
    process.stdout.write(`\r  Insurances: ${processed} encrypted, ${skipped} skipped`);
  }

  console.log(`\n  Done: ${processed} encrypted, ${skipped} already encrypted`);
}

async function main() {
  console.log("PHI Encryption Backfill\n");

  try {
    await backfillPatients();
    await backfillInsurances();
    console.log("\nBackfill complete.");
  } catch (error) {
    console.error("\nBackfill failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
