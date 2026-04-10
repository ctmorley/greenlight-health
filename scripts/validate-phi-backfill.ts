/**
 * Validate PHI Encryption Backfill
 *
 * Checks that all Patient and PatientInsurance rows have their encrypted
 * and blind-index columns populated. Also spot-checks decrypt accuracy
 * by comparing decrypted values against plaintext columns.
 *
 * Run BEFORE the plaintext-off cutover to confirm backfill coverage.
 * Exits with code 1 if any gaps or mismatches are found.
 *
 * Usage: npx tsx scripts/validate-phi-backfill.ts
 */

import { PrismaClient } from "@prisma/client";
import { decryptField } from "../lib/security/phi-crypto";

const prisma = new PrismaClient();

let hasErrors = false;

function fail(msg: string) {
  console.error(`  FAIL: ${msg}`);
  hasErrors = true;
}

function pass(msg: string) {
  console.log(`  OK:   ${msg}`);
}

async function validatePatients() {
  console.log("\n--- Patient Encrypted Column Coverage ---\n");

  const total = await prisma.patient.count();
  console.log(`  Total patients: ${total}`);
  if (total === 0) {
    pass("No patient rows to validate.");
    return;
  }

  // Required encrypted columns (every patient must have these)
  const missingRequired = await prisma.patient.count({
    where: {
      OR: [
        { mrnEncrypted: null },
        { firstNameEncrypted: null },
        { lastNameEncrypted: null },
        { dobEncrypted: null },
      ],
    },
  });

  if (missingRequired > 0) {
    fail(`${missingRequired} patients missing required encrypted columns (mrnEncrypted, firstNameEncrypted, lastNameEncrypted, or dobEncrypted)`);
  } else {
    pass("All patients have required encrypted columns.");
  }

  // Required hash columns
  const missingHashes = await prisma.patient.count({
    where: {
      OR: [
        { mrnHash: null },
        { firstNameHash: null },
        { lastNameHash: null },
        { dobHash: null },
      ],
    },
  });

  if (missingHashes > 0) {
    fail(`${missingHashes} patients missing required hash columns (mrnHash, firstNameHash, lastNameHash, or dobHash)`);
  } else {
    pass("All patients have required hash columns.");
  }

  // Optional encrypted columns: only a gap if plaintext is non-null but encrypted is null
  const missingPhone = await prisma.patient.count({
    where: { phone: { not: null }, phoneEncrypted: null },
  });
  const missingEmail = await prisma.patient.count({
    where: { email: { not: null }, emailEncrypted: null },
  });
  const missingAddress = await prisma.patient.count({
    where: { address: { not: null }, addressEncrypted: null },
  });
  const missingEmailHash = await prisma.patient.count({
    where: { email: { not: null }, emailHash: null },
  });

  const optionalGaps = missingPhone + missingEmail + missingAddress + missingEmailHash;
  if (optionalGaps > 0) {
    if (missingPhone > 0) fail(`${missingPhone} patients have phone but no phoneEncrypted`);
    if (missingEmail > 0) fail(`${missingEmail} patients have email but no emailEncrypted`);
    if (missingAddress > 0) fail(`${missingAddress} patients have address but no addressEncrypted`);
    if (missingEmailHash > 0) fail(`${missingEmailHash} patients have email but no emailHash`);
  } else {
    pass("All optional patient encrypted columns are consistent.");
  }
}

async function validateInsurances() {
  console.log("\n--- PatientInsurance Encrypted Column Coverage ---\n");

  const total = await prisma.patientInsurance.count();
  console.log(`  Total insurances: ${total}`);
  if (total === 0) {
    pass("No insurance rows to validate.");
    return;
  }

  const missingMemberId = await prisma.patientInsurance.count({
    where: { memberIdEncrypted: null },
  });

  if (missingMemberId > 0) {
    fail(`${missingMemberId} insurances missing memberIdEncrypted`);
  } else {
    pass("All insurances have memberIdEncrypted.");
  }

  const missingMemberHash = await prisma.patientInsurance.count({
    where: { memberIdHash: null },
  });

  if (missingMemberHash > 0) {
    fail(`${missingMemberHash} insurances missing memberIdHash`);
  } else {
    pass("All insurances have memberIdHash.");
  }

  const missingGroupNumber = await prisma.patientInsurance.count({
    where: { groupNumber: { not: null }, groupNumberEncrypted: null },
  });

  if (missingGroupNumber > 0) {
    fail(`${missingGroupNumber} insurances have groupNumber but no groupNumberEncrypted`);
  } else {
    pass("All optional insurance encrypted columns are consistent.");
  }
}

async function spotCheckDecryptAccuracy() {
  console.log("\n--- Spot-Check: Decrypt vs Plaintext ---\n");

  // Sample up to 10 patients that have both plaintext and encrypted values
  const sample = await prisma.patient.findMany({
    where: {
      firstNameEncrypted: { not: null },
      firstName: { not: null },
    },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  if (sample.length === 0) {
    pass("No patients with both plaintext and encrypted values to spot-check.");
    return;
  }

  let mismatches = 0;

  for (const patient of sample) {
    const checks: { field: string; plaintext: string; encrypted: string }[] = [
      { field: "firstName", plaintext: patient.firstName!, encrypted: patient.firstNameEncrypted! },
      { field: "lastName", plaintext: patient.lastName!, encrypted: patient.lastNameEncrypted! },
      { field: "mrn", plaintext: patient.mrn!, encrypted: patient.mrnEncrypted! },
    ];

    if (patient.dob && patient.dobEncrypted) {
      checks.push({
        field: "dob",
        plaintext: patient.dob.toISOString(),
        encrypted: patient.dobEncrypted,
      });
    }

    for (const check of checks) {
      try {
        const decrypted = decryptField(check.encrypted);
        if (decrypted !== check.plaintext) {
          fail(`Patient ${patient.id} ${check.field}: decrypted "${decrypted}" !== plaintext "${check.plaintext}"`);
          mismatches++;
        }
      } catch (err) {
        fail(`Patient ${patient.id} ${check.field}: decrypt threw: ${err}`);
        mismatches++;
      }
    }
  }

  if (mismatches === 0) {
    pass(`${sample.length} patients spot-checked, all decrypted values match plaintext.`);
  }

  // Spot-check insurance records
  const insSample = await prisma.patientInsurance.findMany({
    where: {
      memberIdEncrypted: { not: null },
      memberId: { not: null },
    },
    take: 10,
    orderBy: { patientId: "desc" },
  });

  let insMismatches = 0;

  for (const ins of insSample) {
    try {
      const decrypted = decryptField(ins.memberIdEncrypted!);
      if (decrypted !== ins.memberId) {
        fail(`Insurance ${ins.id} memberId: decrypted "${decrypted}" !== plaintext "${ins.memberId}"`);
        insMismatches++;
      }
    } catch (err) {
      fail(`Insurance ${ins.id} memberId: decrypt threw: ${err}`);
      insMismatches++;
    }
  }

  if (insMismatches === 0 && insSample.length > 0) {
    pass(`${insSample.length} insurances spot-checked, all decrypted values match plaintext.`);
  }
}

async function main() {
  console.log("PHI Encryption Backfill Validation");
  console.log("==================================");

  try {
    await validatePatients();
    await validateInsurances();
    await spotCheckDecryptAccuracy();

    console.log("\n==================================");
    if (hasErrors) {
      console.error("\nVALIDATION FAILED — backfill gaps or mismatches found.");
      console.error("Run `npm run db:backfill-phi` to fill gaps, then re-validate.");
      process.exit(1);
    } else {
      console.log("\nVALIDATION PASSED — all encrypted columns populated, spot-checks clean.");
      console.log("Safe to proceed with plaintext-off cutover.");
    }
  } catch (error) {
    console.error("\nValidation script error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
