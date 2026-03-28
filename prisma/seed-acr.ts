/**
 * ACR Appropriateness Criteria Ingestion Script
 *
 * Loads 12,000+ clinical guidelines from the ACR dataset into
 * the clinical_guidelines table. Maps procedures to CPT codes
 * where possible using known procedure-to-CPT mappings.
 *
 * Usage: npx tsx prisma/seed-acr.ts
 */

import { PrismaClient, AppropriatenessRating, EvidenceStrength } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// ─── Procedure → CPT Code Mappings ─────────────────────────
// Maps ACR procedure descriptions to CPT codes.
// This covers the most common imaging procedures.
const PROCEDURE_CPT_MAP: Record<string, string[]> = {
  // MRI
  "MRI head without IV contrast": ["70551"],
  "MRI head without and with IV contrast": ["70553"],
  "MRI head with IV contrast": ["70552"],
  "MRI cervical spine without IV contrast": ["72141"],
  "MRI cervical spine without and with IV contrast": ["72156"],
  "MRI thoracic spine without IV contrast": ["72146"],
  "MRI thoracic spine without and with IV contrast": ["72157"],
  "MRI lumbar spine without IV contrast": ["72148"],
  "MRI lumbar spine without and with IV contrast": ["72158"],
  "MRI abdomen without IV contrast": ["74181"],
  "MRI abdomen without and with IV contrast": ["74183"],
  "MRI pelvis without IV contrast": ["72195"],
  "MRI pelvis without and with IV contrast": ["72197"],
  "MRI knee without IV contrast": ["73721"],
  "MRI knee without and with IV contrast": ["73723"],
  "MRI shoulder without IV contrast": ["73221"],
  "MRI shoulder without and with IV contrast": ["73223"],
  "MRI hip without IV contrast": ["73721"],
  "MRI hip without and with IV contrast": ["73723"],
  "MRI chest without IV contrast": ["71550"],
  "MRI chest without and with IV contrast": ["71552"],
  "MRI orbits face and neck without IV contrast": ["70540"],
  "MRI orbits face and neck without and with IV contrast": ["70543"],

  // CT
  "CT head without IV contrast": ["70450"],
  "CT head with IV contrast": ["70460"],
  "CT head without and with IV contrast": ["70470"],
  "CT cervical spine without IV contrast": ["72125"],
  "CT cervical spine with IV contrast": ["72126"],
  "CT thoracic spine without IV contrast": ["72128"],
  "CT lumbar spine without IV contrast": ["72131"],
  "CT abdomen and pelvis without IV contrast": ["74176"],
  "CT abdomen and pelvis with IV contrast": ["74177"],
  "CT abdomen and pelvis without and with IV contrast": ["74178"],
  "CT abdomen without IV contrast": ["74150"],
  "CT abdomen with IV contrast": ["74160"],
  "CT chest without IV contrast": ["71250"],
  "CT chest with IV contrast": ["71260"],
  "CT chest without and with IV contrast": ["71270"],

  // CTA
  "CTA head with IV contrast": ["70496"],
  "CTA neck with IV contrast": ["70498"],
  "CTA chest with IV contrast": ["71275"],
  "CTA abdomen and pelvis with IV contrast": ["74174"],
  "CTA coronary arteries with IV contrast": ["75574"],
  "CTA lower extremity with IV contrast": ["73706"],

  // MRA
  "MRA head without IV contrast": ["70544"],
  "MRA head without and with IV contrast": ["70546"],
  "MRA neck without IV contrast": ["70547"],
  "MRA neck without and with IV contrast": ["70549"],
  "MRA chest without and with IV contrast": ["71555"],
  "MRA abdomen without and with IV contrast": ["74185"],

  // Ultrasound
  "US abdomen": ["76700"],
  "US duplex Doppler abdomen": ["93975"],
  "US pelvis transabdominal": ["76856"],
  "US pelvis transvaginal": ["76830"],
  "US scrotum": ["76870"],
  "US shoulder": ["76881"],
  "US knee": ["76881"],
  "US hip": ["76885"],
  "US echocardiography transthoracic resting": ["93306"],
  "US duplex Doppler carotid": ["93880"],
  "US duplex Doppler lower extremity": ["93970"],

  // Nuclear Medicine / PET
  "FDG-PET/CT skull base to mid-thigh": ["78816"],
  "Tc-99m bone scan whole body": ["78300"],
  "SPECT MPI rest and stress": ["78452"],
  "Tc-99m sestamibi or Tc-99m tetrofosmin parathyroid scintigraphy with SPECT": ["78072"],

  // X-ray
  "Radiography chest": ["71046"],
  "Radiography cervical spine": ["72052"],
  "Radiography thoracic spine": ["72072"],
  "Radiography lumbar spine": ["72110"],
  "Radiography knee": ["73562"],
  "Radiography shoulder": ["73030"],
  "Radiography hip": ["73502"],
  "Radiography pelvis": ["72170"],
  "Radiography abdomen": ["74022"],
  "Radiography ankle": ["73610"],
  "Radiography hand": ["73130"],
  "Radiography wrist": ["73110"],
  "Radiography foot": ["73630"],
  "Radiography elbow": ["73080"],

  // Mammography
  "Mammography diagnostic": ["77066"],
  "Mammography screening": ["77067"],
  "Digital breast tomosynthesis diagnostic": ["77063"],

  // Fluoroscopy
  "Fluoroscopy upper GI series": ["74240"],
  "Fluoroscopy voiding cystourethrography": ["74455"],
  "Arthrography shoulder": ["73040"],
};

// Fuzzy match: try exact match first, then partial
function findCptCodes(procedure: string): string[] {
  // Exact match
  if (PROCEDURE_CPT_MAP[procedure]) {
    return PROCEDURE_CPT_MAP[procedure];
  }

  // Normalize and try partial match
  const normalized = procedure.toLowerCase();
  for (const [key, codes] of Object.entries(PROCEDURE_CPT_MAP)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return codes;
    }
  }

  return [];
}

// ─── Condition → ICD-10 Mappings (common ones) ─────────────
const CONDITION_ICD10_MAP: Record<string, string[]> = {
  "Acute Low Back Pain": ["M54.5", "M54.50"],
  "Low Back Pain": ["M54.5", "M54.50"],
  "Chronic Low Back Pain": ["M54.5"],
  "Cervical Neck Pain": ["M54.2"],
  "Headache": ["R51", "R51.9", "G43.909"],
  "Acute Nonspecific Chest Pain-Low Probability of Coronary Artery Disease": ["R07.9", "R07.89"],
  "Suspected Pulmonary Embolism": ["I26.99", "R06.02"],
  "Shoulder Pain": ["M25.519", "M75.100"],
  "Hip Pain": ["M25.559", "M16.9"],
  "Knee Pain": ["M25.569", "M17.9"],
  "Acute Pancreatitis": ["K85.9"],
  "Acute Pyelonephritis": ["N10"],
  "Acute Onset Flank Pain-Suspicion of Stone Disease (Urolithiasis)": ["N20.0", "N23"],
  "Breast Cancer Screening": ["Z12.31"],
  "Palpable Breast Masses": ["N63.0"],
  "Lung Cancer Screening": ["Z87.891"],
  "Colorectal Cancer Screening": ["Z12.11"],
  "Acute Appendicitis": ["K35.80"],
  "Acute Nonlocalized Abdominal Pain": ["R10.9"],
  "Stroke": ["I63.9", "G45.9"],
  "Seizures": ["R56.9", "G40.909"],
  "Blunt Abdominal Trauma": ["S39.91XA"],
  "Hematuria": ["R31.9"],
  "Abnormal Liver Function Tests": ["R94.5"],
  "Deep Venous Thrombosis": ["I82.409"],
};

function findIcd10Codes(condition: string): string[] {
  if (CONDITION_ICD10_MAP[condition]) {
    return CONDITION_ICD10_MAP[condition];
  }

  // Partial match
  const normalized = condition.toLowerCase();
  for (const [key, codes] of Object.entries(CONDITION_ICD10_MAP)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return codes;
    }
  }

  return [];
}

// ─── Main ───────────────────────────────────────────────────

interface AcrRecord {
  condition: string;
  variant: string;
  procedure: string;
  rating: number;
  ratingCategory: string;
  evidenceStrength: string;
  radiationLevel: number | null;
  radiationDose: string | null;
  panelSpecialty: string | null;
  references: string | null;
}

async function main() {
  console.log("Loading ACR Appropriateness Criteria...\n");

  const dataPath = join(__dirname, "acr-criteria.json");
  const raw: AcrRecord[] = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`  Loaded ${raw.length} records from acr-criteria.json`);

  // Clear existing ACR guidelines
  const deleted = await prisma.clinicalGuideline.deleteMany({
    where: { source: "ACR" },
  });
  console.log(`  Cleared ${deleted.count} existing ACR records`);

  // Batch insert
  const BATCH_SIZE = 500;
  let inserted = 0;
  let withCpt = 0;
  let withIcd = 0;

  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const batch = raw.slice(i, i + BATCH_SIZE);

    const records = batch.map((r) => {
      const cptCodes = findCptCodes(r.procedure);
      const icd10Codes = findIcd10Codes(r.condition);
      if (cptCodes.length > 0) withCpt++;
      if (icd10Codes.length > 0) withIcd++;

      let refs: object | undefined;
      try {
        refs = r.references ? JSON.parse(r.references) : undefined;
      } catch {
        refs = undefined;
      }

      return {
        source: "ACR",
        sourceVersion: "2024",
        condition: r.condition,
        variant: r.variant,
        procedure: r.procedure,
        cptCodes,
        icd10Codes,
        rating: r.rating,
        ratingCategory: r.ratingCategory as AppropriatenessRating,
        evidenceStrength: r.evidenceStrength as EvidenceStrength,
        radiationLevel: r.radiationLevel,
        radiationDose: r.radiationDose,
        panelSpecialty: r.panelSpecialty,
        references: refs,
      };
    });

    await prisma.clinicalGuideline.createMany({ data: records });
    inserted += records.length;
    process.stdout.write(`  Inserted ${inserted}/${raw.length} records\r`);
  }

  console.log(`\n\n  ACR Ingestion Complete!`);
  console.log(`  Total records:       ${inserted}`);
  console.log(`  With CPT mappings:   ${withCpt}`);
  console.log(`  With ICD-10 mappings: ${withIcd}`);
  console.log(`  Unique conditions:   ${new Set(raw.map((r) => r.condition)).size}`);
  console.log(`  Unique procedures:   ${new Set(raw.map((r) => r.procedure)).size}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
