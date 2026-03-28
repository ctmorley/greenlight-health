import type { PayerQuestionnaire } from "./types";

/**
 * Sample payer questionnaires for common PA scenarios.
 * In production, these would be fetched from the payer's FHIR server
 * via the DTR $questionnaire-package operation.
 */
export const SAMPLE_QUESTIONNAIRES: PayerQuestionnaire[] = [
  {
    id: "pa-imaging-mri",
    url: "https://greenlight-health.vercel.app/Questionnaire/pa-imaging-mri",
    title: "Prior Authorization — MRI",
    status: "active",
    publisher: "GreenLight Sample Payer",
    serviceCategories: ["imaging"],
    cptCodes: ["70551", "70552", "70553", "72141", "72146", "72148", "72156", "72157", "73221", "73721"],
    item: [
      {
        linkId: "patient-info",
        text: "Patient Information",
        type: "group",
        item: [
          {
            linkId: "patient-name",
            text: "Patient Name",
            type: "string",
            required: true,
            extension: [{
              url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression",
              valueExpression: { language: "text/cql", expression: "Patient.name" },
            }],
          },
          {
            linkId: "patient-dob",
            text: "Date of Birth",
            type: "date",
            required: true,
            extension: [{
              url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression",
              valueExpression: { language: "text/cql", expression: "Patient.birthDate" },
            }],
          },
          {
            linkId: "member-id",
            text: "Insurance Member ID",
            type: "string",
            required: true,
          },
          {
            linkId: "mrn",
            text: "Medical Record Number",
            type: "string",
          },
        ],
      },
      {
        linkId: "clinical-info",
        text: "Clinical Information",
        type: "group",
        item: [
          {
            linkId: "primary-diagnosis",
            text: "Primary Diagnosis (ICD-10)",
            type: "string",
            required: true,
          },
          {
            linkId: "procedure-description",
            text: "Procedure / Study Requested",
            type: "string",
            required: true,
          },
          {
            linkId: "cpt-codes",
            text: "CPT Code(s)",
            type: "string",
            required: true,
          },
          {
            linkId: "clinical-indication",
            text: "Clinical Indication / Reason for Study",
            type: "text",
            required: true,
          },
          {
            linkId: "symptom-duration",
            text: "Duration of Symptoms",
            type: "choice",
            answerOption: [
              { valueString: "Less than 4 weeks" },
              { valueString: "4-6 weeks" },
              { valueString: "6-12 weeks" },
              { valueString: "More than 12 weeks" },
            ],
          },
          {
            linkId: "conservative-treatment",
            text: "Has the patient completed conservative treatment?",
            type: "boolean",
          },
          {
            linkId: "conservative-treatment-details",
            text: "Conservative Treatment Details (medications, PT, etc.)",
            type: "text",
          },
          {
            linkId: "prior-imaging",
            text: "Has prior imaging been performed for this condition?",
            type: "boolean",
          },
          {
            linkId: "prior-imaging-details",
            text: "Prior Imaging Results",
            type: "text",
          },
          {
            linkId: "red-flags",
            text: "Red Flag Symptoms Present",
            type: "choice",
            repeats: true,
            answerOption: [
              { valueString: "None" },
              { valueString: "Progressive neurological deficit" },
              { valueString: "Bowel/bladder dysfunction" },
              { valueString: "History of malignancy" },
              { valueString: "Unexplained weight loss" },
              { valueString: "Fever / infection" },
              { valueString: "Trauma" },
              { valueString: "Age > 50 with new symptoms" },
            ],
          },
        ],
      },
      {
        linkId: "provider-info",
        text: "Provider Information",
        type: "group",
        item: [
          {
            linkId: "ordering-provider-name",
            text: "Ordering Provider Name",
            type: "string",
            required: true,
          },
          {
            linkId: "ordering-provider-npi",
            text: "Ordering Provider NPI",
            type: "string",
            required: true,
          },
          {
            linkId: "urgency",
            text: "Request Urgency",
            type: "choice",
            required: true,
            answerOption: [
              { valueString: "Routine" },
              { valueString: "Urgent" },
              { valueString: "Emergent" },
            ],
          },
          {
            linkId: "scheduled-date",
            text: "Requested Service Date",
            type: "date",
          },
        ],
      },
    ],
  },
  {
    id: "pa-imaging-ct",
    url: "https://greenlight-health.vercel.app/Questionnaire/pa-imaging-ct",
    title: "Prior Authorization — CT Scan",
    status: "active",
    publisher: "GreenLight Sample Payer",
    serviceCategories: ["imaging"],
    cptCodes: ["70450", "70460", "70551", "71250", "71260", "71275", "72125", "72131", "74150", "74160", "74170", "74176", "74177", "74178"],
    item: [
      {
        linkId: "patient-info",
        text: "Patient Information",
        type: "group",
        item: [
          { linkId: "patient-name", text: "Patient Name", type: "string", required: true },
          { linkId: "patient-dob", text: "Date of Birth", type: "date", required: true },
          { linkId: "member-id", text: "Insurance Member ID", type: "string", required: true },
        ],
      },
      {
        linkId: "clinical-info",
        text: "Clinical Information",
        type: "group",
        item: [
          { linkId: "primary-diagnosis", text: "Primary Diagnosis (ICD-10)", type: "string", required: true },
          { linkId: "procedure-description", text: "Study Requested", type: "string", required: true },
          { linkId: "cpt-codes", text: "CPT Code(s)", type: "string", required: true },
          { linkId: "clinical-indication", text: "Clinical Indication", type: "text", required: true },
          {
            linkId: "contrast-required",
            text: "Is contrast required?",
            type: "choice",
            answerOption: [
              { valueString: "Without contrast" },
              { valueString: "With contrast" },
              { valueString: "With and without contrast" },
            ],
          },
          { linkId: "prior-imaging", text: "Has prior imaging been performed?", type: "boolean" },
          { linkId: "prior-imaging-details", text: "Prior Imaging Results", type: "text" },
          {
            linkId: "radiation-consideration",
            text: "Radiation Exposure Consideration",
            type: "display",
          },
        ],
      },
      {
        linkId: "provider-info",
        text: "Provider Information",
        type: "group",
        item: [
          { linkId: "ordering-provider-name", text: "Ordering Provider Name", type: "string", required: true },
          { linkId: "ordering-provider-npi", text: "Ordering Provider NPI", type: "string", required: true },
          {
            linkId: "urgency",
            text: "Request Urgency",
            type: "choice",
            required: true,
            answerOption: [
              { valueString: "Routine" },
              { valueString: "Urgent" },
              { valueString: "Emergent" },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Finds matching questionnaires for the given CPT codes and service category.
 */
export function findMatchingQuestionnaires(
  cptCodes: string[],
  serviceCategory: string
): PayerQuestionnaire[] {
  return SAMPLE_QUESTIONNAIRES.filter((q) => {
    if (!q.serviceCategories.includes(serviceCategory)) return false;
    if (q.cptCodes.length === 0) return true; // Category-wide
    return q.cptCodes.some((code) => cptCodes.includes(code));
  });
}
