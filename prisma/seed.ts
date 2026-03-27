import { PrismaClient, OrganizationType, UserRole, Gender, PlanType, PayerType, RbmVendor, ServiceCategory, ServiceType, AuthStatus, Urgency, DocumentCategory, DenialReasonCategory, AppealLevel, AppealStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { DENIAL_REASON_CODES } from "../lib/denial-reasons";

const prisma = new PrismaClient();

// ─── Fixture PDF Generator ──────────────────────────────────

/**
 * Generates a minimal valid PDF file with document metadata.
 * This creates a real PDF that can be opened in any PDF viewer.
 */
function generateFixturePdf(category: string, referenceNumber: string, patientName: string): Buffer {
  const title = category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const dateStr = new Date().toISOString().split("T")[0];
  const content = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    `4 0 obj<</Length 260>>stream`,
    "BT",
    "/F1 16 Tf 72 720 Td",
    `(${title}) Tj`,
    "/F1 12 Tf 0 -30 Td",
    `(Reference: ${referenceNumber}) Tj`,
    "0 -20 Td",
    `(Patient: ${patientName}) Tj`,
    "0 -20 Td",
    `(Date: ${dateStr}) Tj`,
    "0 -30 Td",
    "/F1 10 Tf",
    "(This is a seeded fixture document for development and testing.) Tj",
    "0 -15 Td",
    "(GreenLight Prior Authorization System) Tj",
    "ET",
    "endstream",
    "endobj",
    "",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000266 00000 n ",
    "0000000206 00000 n ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref",
    "578",
    "%%EOF",
  ].join("\n");
  return Buffer.from(content, "utf-8");
}

// ─── Helpers ─────────────────────────────────────────────────

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/** Clamp a date so it never exceeds `ceiling` (defaults to now). */
function clampDate(date: Date, ceiling: Date = new Date()): Date {
  return date > ceiling ? new Date(ceiling) : date;
}

function formatRefNumber(date: Date, index: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `GL-${y}${m}${d}-${String(index).padStart(5, "0")}`;
}

// ─── Static Data ─────────────────────────────────────────────

const ORGS = [
  { name: "Metro Advanced Imaging", type: OrganizationType.imaging_center, npi: "1234567890", address: "450 Medical Plaza Dr, Suite 200, Chicago, IL 60601", phone: "(312) 555-0100", fax: "(312) 555-0101", email: "admin@metroadvancedimaging.com" },
  { name: "Lakeview Surgical Center", type: OrganizationType.surgical_center, npi: "2345678901", address: "1200 Lakeshore Blvd, Suite 500, Milwaukee, WI 53202", phone: "(414) 555-0200", fax: "(414) 555-0201", email: "admin@lakeviewsurgical.com" },
  { name: "Horizon Community Hospital", type: OrganizationType.hospital, npi: "3456789012", address: "800 University Ave, Madison, WI 53706", phone: "(608) 555-0300", fax: "(608) 555-0301", email: "admin@horizoncommunity.org" },
];

const USERS_PER_ORG = [
  { firstName: "Sarah", lastName: "Mitchell", role: UserRole.admin, title: "Practice Manager" },
  { firstName: "James", lastName: "Patel", role: UserRole.pa_coordinator, title: "PA Coordinator" },
  { firstName: "Emily", lastName: "Chen", role: UserRole.physician, title: "MD", npiNumber: "9876543210" },
  { firstName: "Michael", lastName: "Torres", role: UserRole.viewer, title: "Front Desk" },
];

const PAYERS_DATA = [
  { name: "Aetna", payerId: "AETNA001", type: PayerType.commercial, phone: "(800) 872-3862", portalUrl: "https://www.aetna.com/providers.html", electronicSubmission: true, avgResponseDays: 5, rbmVendor: RbmVendor.evicore },
  { name: "Blue Cross Blue Shield", payerId: "BCBS001", type: PayerType.commercial, phone: "(800) 262-2583", portalUrl: "https://www.bcbs.com/provider", electronicSubmission: true, avgResponseDays: 4, rbmVendor: RbmVendor.carelon },
  { name: "Cigna Healthcare", payerId: "CIGNA001", type: PayerType.commercial, phone: "(800) 244-6224", portalUrl: "https://cignaforhcp.cigna.com", electronicSubmission: true, avgResponseDays: 5, rbmVendor: RbmVendor.evicore },
  { name: "UnitedHealthcare", payerId: "UHC001", type: PayerType.commercial, phone: "(800) 842-3850", portalUrl: "https://www.uhcprovider.com", electronicSubmission: true, avgResponseDays: 3, rbmVendor: RbmVendor.direct },
  { name: "Humana", payerId: "HUMANA001", type: PayerType.commercial, phone: "(800) 457-4708", portalUrl: "https://www.humana.com/provider", electronicSubmission: true, avgResponseDays: 6, rbmVendor: RbmVendor.carelon },
  { name: "Medicare Part B", payerId: "MCARE001", type: PayerType.medicare, phone: "(800) 633-4227", portalUrl: "https://www.cms.gov", electronicSubmission: true, avgResponseDays: 7, rbmVendor: null },
  { name: "Medicaid Illinois", payerId: "MCAID_IL", type: PayerType.medicaid, phone: "(877) 782-5565", portalUrl: "https://www.illinois.gov/hfs", electronicSubmission: false, avgResponseDays: 10, rbmVendor: null },
  { name: "Medicaid Wisconsin", payerId: "MCAID_WI", type: PayerType.medicaid, phone: "(800) 362-3002", portalUrl: "https://www.forwardhealth.wi.gov", electronicSubmission: false, avgResponseDays: 10, rbmVendor: null },
  { name: "TRICARE", payerId: "TRICARE1", type: PayerType.tricare, phone: "(800) 444-5445", portalUrl: "https://www.tricare.mil", electronicSubmission: true, avgResponseDays: 8, rbmVendor: null },
  { name: "Anthem BCBS", payerId: "ANTHEM01", type: PayerType.commercial, phone: "(800) 331-1476", portalUrl: "https://www.anthem.com/provider", electronicSubmission: true, avgResponseDays: 4, rbmVendor: RbmVendor.nia },
  { name: "Centene (Ambetter)", payerId: "CENTEN01", type: PayerType.commercial, phone: "(877) 687-1186", portalUrl: "https://www.ambetter.com", electronicSubmission: true, avgResponseDays: 7, rbmVendor: RbmVendor.evicore },
  { name: "Molina Healthcare", payerId: "MOLINA01", type: PayerType.medicaid, phone: "(866) 472-4585", portalUrl: "https://www.molinahealthcare.com", electronicSubmission: true, avgResponseDays: 8, rbmVendor: null },
  { name: "Health Alliance", payerId: "HEALTH01", type: PayerType.commercial, phone: "(800) 851-3379", portalUrl: "https://www.healthalliance.org", electronicSubmission: true, avgResponseDays: 5, rbmVendor: RbmVendor.direct },
  { name: "Oscar Health", payerId: "OSCAR001", type: PayerType.commercial, phone: "(855) 672-2788", portalUrl: "https://www.hioscar.com", electronicSubmission: true, avgResponseDays: 4, rbmVendor: RbmVendor.direct },
  { name: "Kaiser Permanente", payerId: "KAISER01", type: PayerType.commercial, phone: "(800) 464-4000", portalUrl: "https://www.kaiserpermanente.org", electronicSubmission: true, avgResponseDays: 3, rbmVendor: RbmVendor.direct },
];

const IMAGING_CPT_CODES = [
  "70553", "70551", "70552", // MRI Brain
  "72148", "72149", "72158", // MRI Lumbar Spine
  "73721", "73722", "73723", // MRI Lower Extremity Joint
  "74176", "74177", "74178", // CT Abdomen/Pelvis
  "71260", "71275",          // CT Chest
  "78816", "78815",          // PET/CT
  "76642", "76641",          // Ultrasound Breast
  "77067", "77066",          // Mammography
  "77080",                    // DEXA
  "78452",                    // Nuclear Cardiology
];

const SURGICAL_CPT_CODES = [
  "27447", // Total Knee Arthroplasty
  "27130", // Total Hip Arthroplasty
  "29881", // Arthroscopy Knee
  "63030", // Lumbar Laminotomy
  "22551", // Cervical Fusion
  "49505", // Inguinal Hernia Repair
  "47562", // Laparoscopic Cholecystectomy
  "44970", // Laparoscopic Appendectomy
  "28296", // Bunionectomy
  "23472", // Rotator Cuff Repair
];

const ICD10_CODES = [
  "M54.5", "M54.2", "M79.3", "M25.561", "M17.11",
  "M16.11", "S06.0X0A", "G43.909", "R51.9", "K80.20",
  "M75.110", "M23.611", "M47.812", "S82.001A", "M48.06",
  "C50.911", "Z12.31", "R10.9", "J18.9", "I25.10",
  "M62.830", "G89.29", "R06.02", "Z96.641", "E11.9",
];

const FIRST_NAMES = [
  "Robert", "Maria", "David", "Jennifer", "William", "Patricia", "Richard", "Linda",
  "Joseph", "Barbara", "Thomas", "Elizabeth", "Charles", "Susan", "Christopher", "Jessica",
  "Daniel", "Sarah", "Matthew", "Karen", "Anthony", "Lisa", "Mark", "Nancy",
  "Donald", "Betty", "Steven", "Margaret", "Paul", "Sandra", "Andrew", "Ashley",
  "Joshua", "Kimberly", "Kenneth", "Emily", "Kevin", "Donna", "Brian", "Michelle",
  "George", "Carol", "Timothy", "Amanda", "Ronald", "Dorothy", "Edward", "Melissa",
  "Jason", "Deborah",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts",
];

// Map centralized denial reason codes to Prisma enum type for seeding
const DENIAL_REASONS: { category: DenialReasonCategory; code: string; description: string }[] =
  DENIAL_REASON_CODES.map((r) => ({
    category: r.category as DenialReasonCategory,
    code: r.code,
    description: r.description,
  }));

const PLAN_NAMES = [
  "PPO Gold", "PPO Silver", "HMO Select", "EPO Essential", "POS Premier",
  "PPO Platinum", "HMO Basic", "PPO Standard", "Medicare Advantage", "Medicaid Managed",
];

// ─── Payer Rules Data ────────────────────────────────────────

function buildPayerRules(payerId: string) {
  const rules: { payerId: string; serviceCategory: ServiceCategory; cptCode: string | null; requiresPA: boolean; clinicalCriteria: Prisma.InputJsonValue | undefined }[] = [];

  // All imaging requires PA by default
  rules.push({
    payerId,
    serviceCategory: ServiceCategory.imaging,
    cptCode: null,
    requiresPA: true,
    clinicalCriteria: { note: "All advanced imaging requires prior authorization" },
  });

  // Specific imaging codes
  for (const cpt of ["70553", "72148", "74177", "78816"]) {
    rules.push({
      payerId,
      serviceCategory: ServiceCategory.imaging,
      cptCode: cpt,
      requiresPA: true,
      clinicalCriteria: {
        requiredDocuments: ["clinical_notes", "imaging_order"],
        minimumConservativeTreatmentDays: 30,
      },
    });
  }

  // X-ray and standard mammography don't require PA
  for (const cpt of ["77067", "77080"]) {
    rules.push({
      payerId,
      serviceCategory: ServiceCategory.imaging,
      cptCode: cpt,
      requiresPA: false,
      clinicalCriteria: undefined,
    });
  }

  // Surgical requires PA (catch-all)
  rules.push({
    payerId,
    serviceCategory: ServiceCategory.surgical,
    cptCode: null,
    requiresPA: true,
    clinicalCriteria: { note: "All surgical procedures require prior authorization" },
  });

  // Specific surgical CPT codes with detailed criteria
  for (const cpt of ["27447", "27130", "29881", "63030", "22551"]) {
    rules.push({
      payerId,
      serviceCategory: ServiceCategory.surgical,
      cptCode: cpt,
      requiresPA: true,
      clinicalCriteria: {
        requiredDocuments: ["clinical_notes", "medical_records", "letter_of_necessity"],
        minimumConservativeTreatmentDays: 90,
        requiresPhysicianAttestation: true,
      },
    });
  }

  // Lower-complexity surgical codes with lighter requirements
  for (const cpt of ["49505", "47562", "44970", "28296", "23472"]) {
    rules.push({
      payerId,
      serviceCategory: ServiceCategory.surgical,
      cptCode: cpt,
      requiresPA: true,
      clinicalCriteria: {
        requiredDocuments: ["clinical_notes", "imaging_order"],
        minimumConservativeTreatmentDays: 30,
      },
    });
  }

  return rules;
}

// ─── Main Seed ───────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting seed...\n");

  // Clean existing data in reverse dependency order
  await prisma.appeal.deleteMany();
  await prisma.denial.deleteMany();
  await prisma.authStatusChange.deleteMany();
  await prisma.authDocument.deleteMany();
  await prisma.priorAuthRequest.deleteMany();
  await prisma.payerRule.deleteMany();
  await prisma.patientInsurance.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.payer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log("  Cleaned existing data");

  // ── Organizations ────────────────────────────────────────
  const orgs = [];
  for (const o of ORGS) {
    const org = await prisma.organization.create({ data: o });
    orgs.push(org);
  }
  console.log(`  Created ${orgs.length} organizations`);

  // ── Users ────────────────────────────────────────────────
  const passwordHash = await hash("password123", 12);
  const allUsers: Awaited<ReturnType<typeof prisma.user.create>>[] = [];

  for (let oi = 0; oi < orgs.length; oi++) {
    for (let ui = 0; ui < USERS_PER_ORG.length; ui++) {
      const u = USERS_PER_ORG[ui];
      const emailSlug = orgs[oi].name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10);
      const user = await prisma.user.create({
        data: {
          organizationId: orgs[oi].id,
          email: `${u.firstName.toLowerCase()}.${u.lastName.toLowerCase()}@${emailSlug}.com`,
          passwordHash,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          title: u.title,
          npiNumber: u.npiNumber || null,
          isActive: true,
        },
      });
      allUsers.push(user);
    }
  }
  console.log(`  Created ${allUsers.length} users`);

  // ── Payers ───────────────────────────────────────────────
  const payers = [];
  for (const p of PAYERS_DATA) {
    const payer = await prisma.payer.create({ data: p });
    payers.push(payer);
  }
  console.log(`  Created ${payers.length} payers`);

  // ── Payer Rules ──────────────────────────────────────────
  let ruleCount = 0;
  for (const payer of payers) {
    const rules = buildPayerRules(payer.id);
    for (const rule of rules) {
      await prisma.payerRule.create({
        data: {
          payerId: rule.payerId,
          serviceCategory: rule.serviceCategory,
          cptCode: rule.cptCode,
          requiresPA: rule.requiresPA,
          clinicalCriteria: rule.clinicalCriteria ?? undefined,
        },
      });
      ruleCount++;
    }
  }
  console.log(`  Created ${ruleCount} payer rules`);

  // ── Patients ─────────────────────────────────────────────
  const allPatients: Awaited<ReturnType<typeof prisma.patient.create>>[] = [];
  const allInsurances: Awaited<ReturnType<typeof prisma.patientInsurance.create>>[] = [];

  for (let i = 0; i < 50; i++) {
    const org = orgs[i % orgs.length];
    const fn = FIRST_NAMES[i];
    const ln = LAST_NAMES[i];
    const gender = randomItem([Gender.male, Gender.female, Gender.other]);
    const dob = randomDate(new Date(1940, 0, 1), new Date(2005, 0, 1));

    const patient = await prisma.patient.create({
      data: {
        organizationId: org.id,
        mrn: `MRN${String(1000 + i).padStart(6, "0")}`,
        firstName: fn,
        lastName: ln,
        dob,
        gender,
        phone: `(${randomInt(200, 999)}) ${randomInt(200, 999)}-${String(randomInt(0, 9999)).padStart(4, "0")}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${randomInt(1, 99)}@email.com`,
        address: `${randomInt(100, 9999)} ${randomItem(["Oak", "Elm", "Pine", "Maple", "Cedar"])} ${randomItem(["St", "Ave", "Blvd", "Dr", "Ln"])}, ${randomItem(["Chicago", "Milwaukee", "Madison", "Evanston"])}, ${randomItem(["IL", "WI"])} ${randomInt(53000, 60699)}`,
      },
    });
    allPatients.push(patient);

    // Primary insurance for every patient
    const payer = payers[i % payers.length];
    const planType = payer.type === PayerType.medicare ? PlanType.medicare
      : payer.type === PayerType.medicaid ? PlanType.medicaid
      : payer.type === PayerType.tricare ? PlanType.tricare
      : randomItem([PlanType.ppo, PlanType.hmo, PlanType.epo, PlanType.pos]);

    const ins = await prisma.patientInsurance.create({
      data: {
        patientId: patient.id,
        payerId: payer.id,
        planName: `${payer.name} ${randomItem(PLAN_NAMES)}`,
        planType,
        memberId: `${payer.payerId.slice(0, 3)}${String(randomInt(100000, 999999))}`,
        groupNumber: `GRP${randomInt(10000, 99999)}`,
        isPrimary: true,
        effectiveDate: new Date(2024, 0, 1),
      },
    });
    allInsurances.push(ins);

    // ~30% get secondary insurance
    if (Math.random() < 0.3) {
      const secPayer = payers[(i + 5) % payers.length];
      const secIns = await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          payerId: secPayer.id,
          planName: `${secPayer.name} ${randomItem(PLAN_NAMES)}`,
          planType: randomItem([PlanType.ppo, PlanType.hmo]),
          memberId: `${secPayer.payerId.slice(0, 3)}${String(randomInt(100000, 999999))}`,
          groupNumber: `GRP${randomInt(10000, 99999)}`,
          isPrimary: false,
          effectiveDate: new Date(2024, 0, 1),
        },
      });
      allInsurances.push(secIns);
    }
  }
  console.log(`  Created ${allPatients.length} patients with ${allInsurances.length} insurance records`);

  // ── Prior Auth Requests (220) ────────────────────────────
  // Target distribution: 40% approved, 25% pending, 15% denied, 10% draft, 5% appealed, 5% expired/cancelled
  // Deterministic quota-based status allocation to guarantee target distribution
  // Target: 40% approved, 25% pending (15% pending_review + 10% submitted), 15% denied, 10% draft, 5% appealed, 5% expired/cancelled
  const STATUS_QUOTAS: { status: AuthStatus; count: number }[] = [
    { status: AuthStatus.approved, count: 88 },         // 40% of 220
    { status: AuthStatus.pending_review, count: 33 },   // 15% of 220
    { status: AuthStatus.submitted, count: 22 },         // 10% of 220
    { status: AuthStatus.denied, count: 33 },            // 15% of 220
    { status: AuthStatus.draft, count: 22 },             // 10% of 220
    { status: AuthStatus.appealed, count: 11 },          // 5% of 220
    { status: AuthStatus.expired, count: 6 },            // ~2.7% of 220
    { status: AuthStatus.cancelled, count: 5 },          // ~2.3% of 220
  ];

  // Build a flat array of statuses in order, then shuffle for natural distribution
  const statusQueue: AuthStatus[] = [];
  for (const sq of STATUS_QUOTAS) {
    for (let k = 0; k < sq.count; k++) {
      statusQueue.push(sq.status);
    }
  }
  // Fisher-Yates shuffle for randomized but deterministic counts
  for (let k = statusQueue.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [statusQueue[k], statusQueue[j]] = [statusQueue[j], statusQueue[k]];
  }

  const SERVICE_TYPES_BY_CATEGORY: Record<ServiceCategory, ServiceType[]> = {
    [ServiceCategory.imaging]: [ServiceType.mri, ServiceType.ct, ServiceType.pet_ct, ServiceType.ultrasound, ServiceType.xray, ServiceType.mammography, ServiceType.dexa, ServiceType.nuclear],
    [ServiceCategory.surgical]: [ServiceType.surgical_procedure],
    [ServiceCategory.medical]: [ServiceType.medical_procedure],
  };

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const now = new Date();
  // Allow creation dates up to 3 days ago so the full 6-month span is covered;
  // downstream dates (submitted, decided, expired) are individually clamped to `now`.
  const createdAtCeiling = new Date(now.getTime() - 3 * 86400000);
  const PA_COUNT = 220;
  let refIdx = 1;

  // Track denial reason index per org for round-robin category coverage
  const denialReasonIndexByOrg: Record<string, number> = {};

  console.log(`  Creating ${PA_COUNT} prior auth requests...`);

  for (let i = 0; i < PA_COUNT; i++) {
    const org = orgs[i % orgs.length];
    const orgUsers = allUsers.filter(u => u.organizationId === org.id);
    const orgPatients = allPatients.filter(p => p.organizationId === org.id);

    const patient = randomItem(orgPatients);
    const patientInsurances = allInsurances.filter(ins => ins.patientId === patient.id && ins.isPrimary);
    const insurance = patientInsurances[0];
    if (!insurance) continue;

    const payer = payers.find(p => p.id === insurance.payerId)!;
    const coordinator = orgUsers.find(u => u.role === UserRole.pa_coordinator) || orgUsers[0];
    const physician = orgUsers.find(u => u.role === UserRole.physician) || null;

    const serviceCategory = randomItem([ServiceCategory.imaging, ServiceCategory.imaging, ServiceCategory.imaging, ServiceCategory.surgical, ServiceCategory.medical]);
    const serviceType = randomItem(SERVICE_TYPES_BY_CATEGORY[serviceCategory]);
    const isImaging = serviceCategory === ServiceCategory.imaging;
    const cptCodes = isImaging
      ? [randomItem(IMAGING_CPT_CODES), ...(Math.random() > 0.7 ? [randomItem(IMAGING_CPT_CODES)] : [])]
      : [randomItem(SURGICAL_CPT_CODES)];
    const icd10Codes = [randomItem(ICD10_CODES), ...(Math.random() > 0.5 ? [randomItem(ICD10_CODES)] : [])];

    const status = statusQueue[i];
    const createdAt = randomDate(sixMonthsAgo, createdAtCeiling);
    const submittedAt = status !== AuthStatus.draft ? clampDate(new Date(createdAt.getTime() + randomInt(0, 2) * 86400000), now) : null;
    const decidedStatuses: AuthStatus[] = [AuthStatus.approved, AuthStatus.denied, AuthStatus.appealed, AuthStatus.expired, AuthStatus.partially_approved];
    const isDecided = decidedStatuses.includes(status);
    // Compute pendingReviewAt first, then derive decidedAt from it to guarantee monotonic timeline
    const pendingOrDecidedStatuses_pre: AuthStatus[] = [AuthStatus.pending_review, AuthStatus.approved, AuthStatus.denied, AuthStatus.appealed, AuthStatus.expired, AuthStatus.partially_approved];
    const pendingReviewAt = pendingOrDecidedStatuses_pre.includes(status) && submittedAt
      ? clampDate(new Date(submittedAt.getTime() + randomInt(1, 3) * 86400000), now)
      : null;
    const decidedAt = isDecided && pendingReviewAt ? clampDate(addBusinessDays(pendingReviewAt, randomInt(1, payer.avgResponseDays + 3)), now) : null;
    const dueDate = submittedAt ? addBusinessDays(submittedAt, 14) : addBusinessDays(createdAt, 14);

    const urgency = randomItem([Urgency.routine, Urgency.routine, Urgency.routine, Urgency.urgent, Urgency.emergent]);

    const procedureDescriptions: Record<string, string> = {
      mri: "MRI of the specified region with and without contrast",
      ct: "CT scan of the specified region with contrast",
      pet_ct: "PET/CT scan for oncologic evaluation",
      ultrasound: "Diagnostic ultrasound of the specified region",
      xray: "X-ray of the specified region",
      mammography: "Screening/diagnostic mammography bilateral",
      dexa: "DEXA bone density scan",
      nuclear: "Nuclear medicine cardiac stress test",
      surgical_procedure: "Surgical procedure as indicated by CPT codes",
      medical_procedure: "Medical procedure as indicated by CPT codes",
    };

    const pa = await prisma.priorAuthRequest.create({
      data: {
        organizationId: org.id,
        patientId: patient.id,
        createdById: coordinator.id,
        assignedToId: coordinator.id,
        referenceNumber: formatRefNumber(createdAt, refIdx++),
        status,
        urgency,
        serviceCategory,
        serviceType,
        cptCodes,
        icd10Codes,
        procedureDescription: procedureDescriptions[serviceType] || "Procedure as indicated",
        payerId: payer.id,
        insuranceId: insurance.id,
        rbmVendor: payer.rbmVendor,
        orderingPhysicianId: physician?.id || null,
        renderingPhysicianNpi: physician?.npiNumber || null,
        facilityName: org.name,
        scheduledDate: submittedAt ? addBusinessDays(submittedAt, randomInt(7, 30)) : null,
        dueDate,
        clinicalNotes: `Patient presents with ${randomItem(["chronic pain", "acute symptoms", "follow-up evaluation", "diagnostic workup", "pre-surgical assessment"])}. ${randomItem(["Conservative treatment attempted for 6 weeks.", "Symptoms worsening over the past month.", "Previous imaging inconclusive.", "Referred by PCP for further evaluation.", "Post-operative follow-up required."])}`,
        submittedAt,
        decidedAt,
        expiresAt: status === AuthStatus.approved ? addBusinessDays(decidedAt || now, 90) : (status === AuthStatus.expired ? new Date(now.getTime() - randomInt(1, 30) * 86400000) : null),
        approvedUnits: status === AuthStatus.approved ? 1 : null,
        approvedCptCodes: status === AuthStatus.approved ? cptCodes : [],
        createdAt,
      },
    });

    // ── Status Change Audit Trail ──────────────────────────
    // Every PA gets at least one status change entry (creation event)
    const statusTrail: { from: AuthStatus; to: AuthStatus; date: Date; note: string }[] = [];

    // Creation event for every PA
    statusTrail.push({
      from: AuthStatus.draft,
      to: AuthStatus.draft,
      date: createdAt,
      note: "Request created as draft",
    });

    if (status !== AuthStatus.draft) {
      statusTrail.push({
        from: AuthStatus.draft,
        to: AuthStatus.submitted,
        date: submittedAt!,
        note: "Request submitted for payer review",
      });
    }

    const pendingOrDecidedStatuses: AuthStatus[] = [AuthStatus.pending_review, AuthStatus.approved, AuthStatus.denied, AuthStatus.appealed, AuthStatus.expired, AuthStatus.partially_approved];
    if (pendingOrDecidedStatuses.includes(status) && pendingReviewAt) {
      statusTrail.push({
        from: AuthStatus.submitted,
        to: AuthStatus.pending_review,
        date: pendingReviewAt,
        note: "Request received by payer, under clinical review",
      });
    }

    if (status === AuthStatus.approved) {
      statusTrail.push({
        from: AuthStatus.pending_review,
        to: AuthStatus.approved,
        date: decidedAt!,
        note: "Authorization approved per clinical guidelines",
      });
    } else if (status === AuthStatus.denied) {
      statusTrail.push({
        from: AuthStatus.pending_review,
        to: AuthStatus.denied,
        date: decidedAt!,
        note: "Authorization denied - see denial details",
      });
    } else if (status === AuthStatus.appealed) {
      // Use decidedAt as the denial date (guaranteed > pendingReviewAt)
      const deniedDate = decidedAt!;
      statusTrail.push({
        from: AuthStatus.pending_review,
        to: AuthStatus.denied,
        date: deniedDate,
        note: "Authorization denied - see denial details",
      });
      statusTrail.push({
        from: AuthStatus.denied,
        to: AuthStatus.appealed,
        date: clampDate(new Date(deniedDate.getTime() + randomInt(2, 10) * 86400000), now),
        note: "Appeal filed - first level review",
      });
    } else if (status === AuthStatus.expired) {
      statusTrail.push({
        from: AuthStatus.pending_review,
        to: AuthStatus.approved,
        date: decidedAt!,
        note: "Authorization approved",
      });
      // Expired date must be after decidedAt
      const expiredDate = clampDate(new Date(Math.max(decidedAt!.getTime() + 30 * 86400000, now.getTime() - randomInt(1, 14) * 86400000)), now);
      statusTrail.push({
        from: AuthStatus.approved,
        to: AuthStatus.expired,
        date: expiredDate,
        note: "Authorization expired - past valid date",
      });
    } else if (status === AuthStatus.cancelled) {
      statusTrail.push({
        from: AuthStatus.draft,
        to: AuthStatus.cancelled,
        date: clampDate(new Date(createdAt.getTime() + randomInt(1, 5) * 86400000), now),
        note: "Request cancelled by coordinator",
      });
    }

    for (const sc of statusTrail) {
      await prisma.authStatusChange.create({
        data: {
          priorAuthId: pa.id,
          changedById: coordinator.id,
          fromStatus: sc.from,
          toStatus: sc.to,
          note: sc.note,
          createdAt: sc.date,
        },
      });
    }

    // ── Documents (for non-draft) ──────────────────────────
    const patientName = `${patient.firstName} ${patient.lastName}`;
    if (status !== AuthStatus.draft) {
      const docCategories: DocumentCategory[] = [DocumentCategory.imaging_order, DocumentCategory.clinical_notes];
      if (Math.random() > 0.5) docCategories.push(DocumentCategory.lab_results);
      if (Math.random() > 0.7) docCategories.push(DocumentCategory.medical_records);

      for (const cat of docCategories) {
        const fileName = `${cat.replace(/_/g, "-")}-${pa.referenceNumber}.pdf`;
        const relativePath = path.join("uploads", org.id, pa.id, fileName);
        const absolutePath = path.join(process.cwd(), relativePath);

        // Create the directory and write a fixture PDF file to disk
        await mkdir(path.dirname(absolutePath), { recursive: true });
        const fixtureContent = generateFixturePdf(cat, pa.referenceNumber, patientName);
        await writeFile(absolutePath, fixtureContent);

        await prisma.authDocument.create({
          data: {
            priorAuthId: pa.id,
            uploadedById: coordinator.id,
            fileName,
            fileType: "application/pdf",
            filePath: relativePath,
            fileSize: fixtureContent.length,
            category: cat,
            createdAt: submittedAt || createdAt,
          },
        });
      }
    }

    // ── Denials ────────────────────────────────────────────
    if (status === AuthStatus.denied || status === AuthStatus.appealed) {
      // Round-robin through denial reasons to ensure all categories are represented per org
      if (denialReasonIndexByOrg[org.id] === undefined) denialReasonIndexByOrg[org.id] = 0;
      const denialReason = DENIAL_REASONS[denialReasonIndexByOrg[org.id] % DENIAL_REASONS.length];
      denialReasonIndexByOrg[org.id]++;
      const denialDate = status === AuthStatus.appealed
        ? statusTrail.find(s => s.to === AuthStatus.denied)?.date || decidedAt || now
        : decidedAt || now;

      const denial = await prisma.denial.create({
        data: {
          priorAuthId: pa.id,
          denialDate,
          reasonCode: denialReason.code,
          reasonCategory: denialReason.category,
          reasonDescription: denialReason.description,
          payerNotes: `Reviewed under ${payer.name} clinical policy guidelines. ${denialReason.description}`,
        },
      });

      // ── Appeals (for appealed status) ──────────────────
      if (status === AuthStatus.appealed) {
        const appealDate = statusTrail.find(s => s.to === AuthStatus.appealed)?.date || now;
        const appealStatus = randomItem([AppealStatus.filed, AppealStatus.in_review, AppealStatus.won, AppealStatus.lost]);

        await prisma.appeal.create({
          data: {
            priorAuthId: pa.id,
            denialId: denial.id,
            appealLevel: AppealLevel.first,
            filedDate: appealDate,
            filedById: coordinator.id,
            appealReason: `Appealing denial: ${denialReason.description}. Additional clinical documentation provided to support medical necessity.`,
            status: appealStatus,
            decisionDate: ([AppealStatus.won, AppealStatus.lost] as AppealStatus[]).includes(appealStatus)
              ? clampDate(addBusinessDays(appealDate, randomInt(10, 30)), now)
              : null,
            decisionNotes: appealStatus === AppealStatus.won
              ? "Appeal upheld - authorization approved upon additional review"
              : appealStatus === AppealStatus.lost
              ? "Appeal denied - original determination stands"
              : null,
          },
        });
      }
    }

    if ((i + 1) % 50 === 0) console.log(`    ...created ${i + 1}/${PA_COUNT} requests`);
  }

  console.log(`  Created ${PA_COUNT} prior auth requests with audit trails\n`);

  // Summary
  const counts = {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    payers: await prisma.payer.count(),
    payerRules: await prisma.payerRule.count(),
    patientInsurances: await prisma.patientInsurance.count(),
    priorAuthRequests: await prisma.priorAuthRequest.count(),
    authDocuments: await prisma.authDocument.count(),
    authStatusChanges: await prisma.authStatusChange.count(),
    denials: await prisma.denial.count(),
    appeals: await prisma.appeal.count(),
  };

  console.log("✅ Seed complete! Summary:");
  for (const [key, val] of Object.entries(counts)) {
    console.log(`   ${key}: ${val}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
