/**
 * Da Vinci PAS Bundle Assembler
 *
 * Assembles a FHIR R4 Bundle for Prior Authorization Support (PAS)
 * submission via the Claim/$submit operation.
 *
 * Bundle structure per Da Vinci PAS IG:
 *   Bundle (type: collection)
 *   ├── Claim (use: preauthorization)
 *   ├── Patient
 *   ├── Coverage
 *   ├── ServiceRequest
 *   ├── Practitioner (ordering)
 *   ├── Organization (requesting facility)
 *   ├── Condition (supporting diagnoses)
 *   └── QuestionnaireResponse (DTR documentation)
 */

interface PasBundleInput {
  // Patient
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientDob: string;
  patientGender: string;
  patientMrn: string;

  // Insurance / Coverage
  payerName: string;
  payerId: string;
  memberId: string;
  groupNumber?: string | null;

  // Service
  serviceCategory: string;
  serviceType: string;
  cptCodes: string[];
  icd10Codes: string[];
  procedureDescription: string;
  urgency: string;
  scheduledDate?: string | null;

  // Provider
  orderingPhysicianName?: string | null;
  orderingPhysicianNpi?: string | null;
  renderingPhysicianNpi?: string | null;

  // Facility
  facilityName?: string | null;
  organizationName?: string | null;
  organizationNpi?: string | null;

  // Documentation
  clinicalNotes?: string | null;

  // DTR QuestionnaireResponse (already in FHIR format)
  questionnaireResponse?: Record<string, unknown> | null;

  // GreenLight reference
  referenceNumber: string;
}

/**
 * Assembles the complete PAS submission Bundle.
 */
export function assemblePasBundle(input: PasBundleInput): Record<string, unknown> {
  const now = new Date().toISOString();
  const entries: Array<{ fullUrl: string; resource: Record<string, unknown> }> = [];

  // ── 1. Claim (primary resource) ──
  const claim = buildClaim(input, now);
  entries.push({ fullUrl: "urn:uuid:claim-1", resource: claim });

  // ── 2. Patient ──
  entries.push({
    fullUrl: "urn:uuid:patient-1",
    resource: {
      resourceType: "Patient",
      identifier: [
        { type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR" }] }, value: input.patientMrn },
      ],
      name: [{ family: input.patientLastName, given: [input.patientFirstName] }],
      birthDate: input.patientDob,
      gender: input.patientGender,
    },
  });

  // ── 3. Coverage ──
  entries.push({
    fullUrl: "urn:uuid:coverage-1",
    resource: {
      resourceType: "Coverage",
      status: "active",
      subscriberId: input.memberId,
      beneficiary: { reference: "urn:uuid:patient-1" },
      payor: [{ display: input.payerName }],
      ...(input.groupNumber
        ? { class: [{ type: { coding: [{ code: "group" }] }, value: input.groupNumber }] }
        : {}),
    },
  });

  // ── 4. ServiceRequest ──
  entries.push({
    fullUrl: "urn:uuid:servicerequest-1",
    resource: {
      resourceType: "ServiceRequest",
      status: "active",
      intent: "order",
      priority: mapUrgencyToFhir(input.urgency),
      code: {
        coding: input.cptCodes.map((code) => ({
          system: "http://www.ama-assn.org/go/cpt",
          code,
        })),
        text: input.procedureDescription,
      },
      subject: { reference: "urn:uuid:patient-1" },
      requester: input.orderingPhysicianNpi
        ? { reference: "urn:uuid:practitioner-1" }
        : undefined,
      reasonCode: input.icd10Codes.map((code) => ({
        coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code }],
      })),
      ...(input.scheduledDate
        ? { occurrenceDateTime: input.scheduledDate }
        : {}),
    },
  });

  // ── 5. Practitioner (ordering) ──
  if (input.orderingPhysicianNpi || input.orderingPhysicianName) {
    entries.push({
      fullUrl: "urn:uuid:practitioner-1",
      resource: {
        resourceType: "Practitioner",
        ...(input.orderingPhysicianNpi
          ? {
              identifier: [{
                system: "http://hl7.org/fhir/sid/us-npi",
                value: input.orderingPhysicianNpi,
              }],
            }
          : {}),
        ...(input.orderingPhysicianName
          ? { name: [{ text: input.orderingPhysicianName }] }
          : {}),
      },
    });
  }

  // ── 6. Organization ──
  if (input.organizationName || input.facilityName) {
    entries.push({
      fullUrl: "urn:uuid:organization-1",
      resource: {
        resourceType: "Organization",
        name: input.organizationName || input.facilityName,
        ...(input.organizationNpi
          ? {
              identifier: [{
                system: "http://hl7.org/fhir/sid/us-npi",
                value: input.organizationNpi,
              }],
            }
          : {}),
      },
    });
  }

  // ── 7. Conditions (supporting diagnoses) ──
  input.icd10Codes.forEach((code, idx) => {
    entries.push({
      fullUrl: `urn:uuid:condition-${idx + 1}`,
      resource: {
        resourceType: "Condition",
        clinicalStatus: {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }],
        },
        code: {
          coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code }],
        },
        subject: { reference: "urn:uuid:patient-1" },
      },
    });
  });

  // ── 8. QuestionnaireResponse (DTR) ──
  if (input.questionnaireResponse) {
    entries.push({
      fullUrl: "urn:uuid:questionnaireresponse-1",
      resource: input.questionnaireResponse,
    });
  }

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: now,
    identifier: {
      system: "https://greenlight-health.vercel.app/pa-reference",
      value: input.referenceNumber,
    },
    entry: entries,
  };
}

function buildClaim(input: PasBundleInput, now: string): Record<string, unknown> {
  return {
    resourceType: "Claim",
    status: "active",
    type: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/claim-type",
        code: input.serviceCategory === "imaging" ? "professional" : "institutional",
      }],
    },
    use: "preauthorization",
    patient: { reference: "urn:uuid:patient-1" },
    created: now,
    insurer: { display: input.payerName },
    provider: input.orderingPhysicianNpi
      ? { reference: "urn:uuid:practitioner-1" }
      : { display: input.organizationName || input.facilityName || "Unknown" },
    priority: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/processpriority",
        code: input.urgency === "emergent" ? "stat" : input.urgency === "urgent" ? "normal" : "deferred",
      }],
    },
    insurance: [{
      sequence: 1,
      focal: true,
      coverage: { reference: "urn:uuid:coverage-1" },
    }],
    diagnosis: input.icd10Codes.map((code, idx) => ({
      sequence: idx + 1,
      diagnosisCodeableConcept: {
        coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code }],
      },
    })),
    item: input.cptCodes.map((code, idx) => ({
      sequence: idx + 1,
      productOrService: {
        coding: [{ system: "http://www.ama-assn.org/go/cpt", code }],
        text: input.procedureDescription,
      },
      ...(input.scheduledDate
        ? { servicedDate: input.scheduledDate }
        : {}),
    })),
    supportingInfo: input.clinicalNotes
      ? [{
          sequence: 1,
          category: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/claiminformationcategory", code: "info" }],
          },
          valueString: input.clinicalNotes.slice(0, 2000), // Truncate for FHIR
        }]
      : [],
  };
}

function mapUrgencyToFhir(urgency: string): string {
  switch (urgency) {
    case "emergent": return "stat";
    case "urgent": return "urgent";
    default: return "routine";
  }
}
