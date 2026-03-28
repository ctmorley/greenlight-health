/**
 * Seed realistic payer clinical policies and denial patterns
 *
 * Usage: npx tsx prisma/seed-payer-policies.ts
 */

import { PrismaClient, ServiceCategory, DenialReasonCategory, RbmVendor } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding payer clinical policies and denial patterns...\n");

  // Get payers
  const payers = await prisma.payer.findMany();
  const payerMap = new Map(payers.map((p) => [p.name, p]));

  // Clear existing
  await prisma.payerClinicalPolicy.deleteMany();
  await prisma.documentationRequirement.deleteMany();
  await prisma.denialPattern.deleteMany();
  console.log("  Cleared existing policies");

  // ─── Payer Clinical Policies ──────────────────────────────
  // Based on real EviCore/Carelon guidelines structure

  const policies = [
    // === AETNA (EviCore) ===
    ...buildPayerPolicies(payerMap.get("Aetna")?.id, "evicore", [
      { cpt: "70553", name: "Brain MRI with/without contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Indication not meeting medical necessity criteria", "Prior conservative treatment not documented"] },
      { cpt: "72148", name: "Lumbar MRI without contrast", conservativeDays: 30, docs: ["clinical_notes", "imaging_order", "prior_imaging"], denialReasons: ["Less than 6 weeks conservative therapy", "No red flag symptoms documented"] },
      { cpt: "72141", name: "Cervical MRI without contrast", conservativeDays: 30, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Conservative treatment period not met", "Neurological exam not documented"] },
      { cpt: "74177", name: "CT abdomen/pelvis with contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order", "lab_results"], denialReasons: ["Clinical indication not supported", "Duplicate study within 90 days"] },
      { cpt: "71260", name: "CT chest with contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Chest X-ray not performed first", "Clinical indication insufficient"] },
      { cpt: "78816", name: "PET/CT skull base to mid-thigh", conservativeDays: 0, docs: ["clinical_notes", "imaging_order", "pathology_report", "prior_imaging"], denialReasons: ["No confirmed malignancy", "Staging not indicated for this cancer type"] },
      { cpt: "70496", name: "CTA head with contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Non-contrast CT or MRA more appropriate", "Clinical scenario doesn't warrant CTA"] },
    ]),

    // === BCBS (Carelon) ===
    ...buildPayerPolicies(payerMap.get("Blue Cross Blue Shield")?.id, "carelon", [
      { cpt: "72148", name: "Lumbar MRI without contrast", conservativeDays: 42, docs: ["clinical_notes", "imaging_order", "physical_therapy_notes"], denialReasons: ["6 weeks conservative treatment required", "Physical therapy not attempted", "No neurological deficit documented"] },
      { cpt: "70553", name: "Brain MRI with/without contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order", "neurological_exam"], denialReasons: ["Headache without red flags", "Routine screening not covered"] },
      { cpt: "73721", name: "MRI knee without contrast", conservativeDays: 30, docs: ["clinical_notes", "imaging_order", "xray_report"], denialReasons: ["X-ray not performed first", "Conservative treatment not attempted", "Mechanical symptoms not documented"] },
      { cpt: "73221", name: "MRI shoulder without contrast", conservativeDays: 30, docs: ["clinical_notes", "imaging_order", "xray_report"], denialReasons: ["X-ray not obtained prior", "Physical therapy not completed", "Range of motion not documented"] },
      { cpt: "74178", name: "CT abdomen/pelvis with/without contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Ultrasound more appropriate initial study", "Repeat study within 60 days"] },
    ]),

    // === CIGNA (EviCore) ===
    ...buildPayerPolicies(payerMap.get("Cigna Healthcare")?.id, "evicore", [
      { cpt: "72148", name: "Lumbar MRI without contrast", conservativeDays: 28, docs: ["clinical_notes", "imaging_order"], denialReasons: ["4 weeks conservative treatment not documented", "Red flags not present"] },
      { cpt: "70553", name: "Brain MRI with/without contrast", conservativeDays: 0, docs: ["clinical_notes", "neurological_exam"], denialReasons: ["Headache without neurological findings", "No change in clinical status"] },
      { cpt: "75574", name: "CTA coronary arteries", conservativeDays: 0, docs: ["clinical_notes", "cardiac_risk_assessment", "prior_stress_test"], denialReasons: ["Stress test not performed first", "Low pretest probability", "Recent catheterization within 12 months"] },
    ]),

    // === UHC (Direct) ===
    ...buildPayerPolicies(payerMap.get("UnitedHealthcare")?.id, "direct", [
      { cpt: "72148", name: "Lumbar MRI without contrast", conservativeDays: 21, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Conservative treatment less than 3 weeks", "No progressive neurological deficit"] },
      { cpt: "70553", name: "Brain MRI with/without contrast", conservativeDays: 0, docs: ["clinical_notes", "imaging_order"], denialReasons: ["Indication not meeting policy criteria"] },
      { cpt: "78816", name: "PET/CT", conservativeDays: 0, docs: ["clinical_notes", "pathology_report", "prior_imaging", "treatment_plan"], denialReasons: ["Biopsy-proven malignancy required", "Surveillance interval too short"] },
    ]),

    // === ANTHEM (NIA) ===
    ...buildPayerPolicies(payerMap.get("Anthem BCBS")?.id, "nia", [
      { cpt: "72148", name: "Lumbar MRI without contrast", conservativeDays: 42, docs: ["clinical_notes", "imaging_order", "physical_therapy_notes"], denialReasons: ["NIA requires 6 weeks conservative care", "No documentation of failed conservative therapy"] },
      { cpt: "70553", name: "Brain MRI with/without contrast", conservativeDays: 0, docs: ["clinical_notes", "neurological_exam"], denialReasons: ["Does not meet NIA clinical criteria for brain MRI"] },
      { cpt: "73721", name: "MRI knee without contrast", conservativeDays: 30, docs: ["clinical_notes", "xray_report"], denialReasons: ["Weight-bearing X-ray required first", "No mechanical symptoms"] },
    ]),
  ];

  const validPolicies = policies.filter((p) => p.payerId);
  await prisma.payerClinicalPolicy.createMany({ data: validPolicies });
  console.log(`  Created ${validPolicies.length} payer clinical policies`);

  // ─── Documentation Requirements ───────────────────────────

  const docReqs = [
    // Universal requirements for advanced imaging
    { payerId: null, rbmVendor: null, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: null, documentType: "clinical_notes", description: "Clinical notes documenting the indication for the study", isRequired: true },
    { payerId: null, rbmVendor: null, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: null, documentType: "imaging_order", description: "Signed imaging order from ordering physician", isRequired: true },

    // EviCore-specific
    { payerId: null, rbmVendor: RbmVendor.evicore, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "72148", documentType: "conservative_treatment_record", description: "Documentation of conservative treatment (PT, medications, rest) for minimum 4-6 weeks", isRequired: true },
    { payerId: null, rbmVendor: RbmVendor.evicore, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "72148", documentType: "neurological_exam", description: "Documented neurological examination findings", isRequired: false },
    { payerId: null, rbmVendor: RbmVendor.evicore, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "78816", documentType: "pathology_report", description: "Pathology report confirming malignancy diagnosis", isRequired: true },
    { payerId: null, rbmVendor: RbmVendor.evicore, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "78816", documentType: "prior_imaging", description: "Prior imaging studies for comparison", isRequired: true },

    // Carelon-specific
    { payerId: null, rbmVendor: RbmVendor.carelon, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "72148", documentType: "physical_therapy_notes", description: "Physical therapy treatment notes showing completion of prescribed PT course", isRequired: true },
    { payerId: null, rbmVendor: RbmVendor.carelon, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "73721", documentType: "xray_report", description: "Weight-bearing X-ray report (required before MRI approval)", isRequired: true },

    // NIA-specific
    { payerId: null, rbmVendor: RbmVendor.nia, serviceCategory: ServiceCategory.imaging, serviceType: null, cptCode: "72148", documentType: "conservative_treatment_record", description: "NIA requires 6 weeks documented conservative therapy before advanced imaging", isRequired: true },

    // Surgical
    { payerId: null, rbmVendor: null, serviceCategory: ServiceCategory.surgical, serviceType: null, cptCode: null, documentType: "clinical_notes", description: "Operative notes or clinical documentation supporting surgical necessity", isRequired: true },
    { payerId: null, rbmVendor: null, serviceCategory: ServiceCategory.surgical, serviceType: null, cptCode: null, documentType: "letter_of_necessity", description: "Letter of medical necessity from performing surgeon", isRequired: true },
    { payerId: null, rbmVendor: null, serviceCategory: ServiceCategory.surgical, serviceType: null, cptCode: "27447", documentType: "conservative_treatment_record", description: "Documentation of failed conservative treatment (PT, injections, bracing) for minimum 3 months", isRequired: true },
    { payerId: null, rbmVendor: null, serviceCategory: ServiceCategory.surgical, serviceType: null, cptCode: "27447", documentType: "imaging_report", description: "Weight-bearing knee X-ray showing Kellgren-Lawrence Grade 3 or 4 osteoarthritis", isRequired: true },
  ];

  await prisma.documentationRequirement.createMany({
    data: docReqs.map((d) => ({
      ...d,
      serviceType: d.serviceType as never,
    })),
  });
  console.log(`  Created ${docReqs.length} documentation requirements`);

  // ─── Denial Patterns ──────────────────────────────────────

  const denialPatterns = [
    // Lumbar MRI — most commonly denied imaging study
    { cptCode: "72148", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "Conservative treatment period not met (requires 4-6 weeks)", frequency: 847, preventionTip: "Document at least 4 weeks of conservative treatment including specific medications, physical therapy dates, and patient response", requiredEvidence: ["conservative_treatment_log", "physical_therapy_notes", "medication_list"] },
    { cptCode: "72148", reasonCategory: DenialReasonCategory.incomplete_documentation, reasonDescription: "Neurological examination findings not documented", frequency: 523, preventionTip: "Include detailed neurological exam with motor strength, sensory testing, and reflex assessment in clinical notes", requiredEvidence: ["neurological_exam_findings"] },
    { cptCode: "72148", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "No red flag symptoms present to justify expedited imaging", frequency: 412, preventionTip: "Document any red flags: progressive neurological deficit, bowel/bladder dysfunction, fever, unexplained weight loss, history of cancer", requiredEvidence: ["clinical_notes_with_red_flags"] },

    // Brain MRI
    { cptCode: "70553", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "Headache without neurological findings does not meet criteria", frequency: 634, preventionTip: "Document specific neurological findings, headache pattern changes, or red flag features. Include failed medication trials.", requiredEvidence: ["neurological_exam", "headache_diary", "medication_history"] },
    { cptCode: "70553", reasonCategory: DenialReasonCategory.incomplete_documentation, reasonDescription: "Clinical indication insufficient — routine screening not covered", frequency: 298, preventionTip: "Specify the clinical indication clearly (seizure workup, tumor surveillance, MS evaluation) rather than generic symptoms", requiredEvidence: ["specific_clinical_indication"] },

    // Knee MRI
    { cptCode: "73721", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "X-ray not obtained prior to MRI request", frequency: 567, preventionTip: "Always obtain weight-bearing knee X-rays before requesting MRI. Include X-ray report with PA submission.", requiredEvidence: ["knee_xray_report"] },
    { cptCode: "73721", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "No mechanical symptoms documented (locking, catching, giving way)", frequency: 345, preventionTip: "Document specific mechanical symptoms, not just 'knee pain'. Include McMurray's test, Lachman's test results.", requiredEvidence: ["physical_exam_with_special_tests"] },

    // Shoulder MRI
    { cptCode: "73221", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "Conservative treatment not attempted — minimum 4 weeks required", frequency: 423, preventionTip: "Document trial of NSAIDs, physical therapy referral, and activity modification before requesting MRI", requiredEvidence: ["conservative_treatment_log", "physical_therapy_notes"] },

    // CT abdomen/pelvis
    { cptCode: "74177", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "Ultrasound or X-ray more appropriate as initial study", frequency: 312, preventionTip: "For abdominal pain, document why CT is needed over ultrasound (e.g., peritoneal signs, prior inconclusive US, trauma)", requiredEvidence: ["clinical_justification_for_ct"] },
    { cptCode: "74177", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "Duplicate study within 90 days without clinical change", frequency: 234, preventionTip: "If repeating CT, document specific clinical change or new symptoms since prior study", requiredEvidence: ["documentation_of_clinical_change"] },

    // PET/CT
    { cptCode: "78816", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "No biopsy-proven malignancy — PET requires confirmed cancer diagnosis", frequency: 445, preventionTip: "PET/CT requires pathology-confirmed malignancy. Include pathology report and specify staging vs. restaging.", requiredEvidence: ["pathology_report", "cancer_staging_documentation"] },
    { cptCode: "78816", reasonCategory: DenialReasonCategory.incomplete_documentation, reasonDescription: "Prior imaging not provided for comparison", frequency: 267, preventionTip: "Include most recent CT/MRI reports and any prior PET results for comparison", requiredEvidence: ["prior_imaging_reports"] },

    // CTA coronary
    { cptCode: "75574", reasonCategory: DenialReasonCategory.medical_necessity, reasonDescription: "Stress test not performed prior to CTA", frequency: 389, preventionTip: "Most payers require functional stress testing before anatomic coronary imaging. Include stress test results.", requiredEvidence: ["stress_test_results", "cardiac_risk_assessment"] },

    // General patterns (no specific CPT)
    { cptCode: null, reasonCategory: DenialReasonCategory.coding_error, reasonDescription: "CPT/ICD-10 mismatch — diagnosis does not support the ordered procedure", frequency: 678, preventionTip: "Verify that ICD-10 codes clinically justify the specific imaging procedure ordered. Use specific codes, not unspecified.", requiredEvidence: ["correct_icd10_mapping"] },
    { cptCode: null, reasonCategory: DenialReasonCategory.incomplete_documentation, reasonDescription: "Clinical notes missing or illegible", frequency: 534, preventionTip: "Always attach typed clinical notes. Handwritten notes are frequently flagged as incomplete.", requiredEvidence: ["typed_clinical_notes"] },
    { cptCode: null, reasonCategory: DenialReasonCategory.missing_precert, reasonDescription: "Service performed before PA approval received", frequency: 456, preventionTip: "Never schedule the procedure before PA is approved. Use the platform's scheduling sync to prevent conflicts.", requiredEvidence: ["pa_approval_confirmation"] },
  ];

  await prisma.denialPattern.createMany({
    data: denialPatterns.map((d) => ({
      ...d,
      payerId: null,
      rbmVendor: null,
      serviceCategory: null,
    })),
  });
  console.log(`  Created ${denialPatterns.length} denial patterns`);

  console.log("\n  Payer policy seeding complete!");
  await prisma.$disconnect();
}

interface PolicyInput {
  cpt: string;
  name: string;
  conservativeDays: number;
  docs: string[];
  denialReasons: string[];
}

function buildPayerPolicies(
  payerId: string | undefined,
  policySource: string,
  inputs: PolicyInput[]
) {
  if (!payerId) return [];
  return inputs.map((input) => ({
    payerId,
    serviceCategory: ServiceCategory.imaging,
    cptCode: input.cpt,
    policyName: `${input.name} (${policySource.toUpperCase()})`,
    policySource,
    requiresPA: true,
    requiredDocuments: input.docs,
    conservativeTxDays: input.conservativeDays,
    commonDenialReasons: input.denialReasons,
    requiresReferral: false,
    requiresPeerReview: false,
  }));
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
