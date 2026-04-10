/**
 * FHIR PAS Bundle → Clearinghouse Request Mapper
 *
 * Extracts structured data from a FHIR R4 PAS Bundle and maps it to the
 * flattened ClearinghouseSubmitRequest shape. Falls back to PriorAuthRequest
 * fields when bundle extraction fails for a given field.
 *
 * The PAS Bundle is assembled by lib/pas/bundle-assembler.ts and contains:
 *   Claim, Patient, Coverage, ServiceRequest, Practitioner, Organization,
 *   Condition(s), QuestionnaireResponse
 */

import type { PayerTransport, PriorAuthRequest } from "@prisma/client";
import type {
  ClearinghouseSubmitRequest,
  ClearinghouseCredentials,
} from "./types";

// ─── Bundle Resource Helpers ───────────────────────────────

interface BundleEntry {
  fullUrl?: string;
  resource?: Record<string, unknown>;
}

function findResource(
  entries: BundleEntry[],
  resourceType: string
): Record<string, unknown> | null {
  const entry = entries.find(
    (e) => e.resource?.resourceType === resourceType
  );
  return (entry?.resource as Record<string, unknown>) ?? null;
}

// ─── Field Extractors ──────────────────────────────────────

function extractPatient(
  patient: Record<string, unknown> | null,
  coverage: Record<string, unknown> | null,
  request: PriorAuthRequest
) {
  const name = (patient?.name as Array<{ family?: string; given?: string[] }>)?.[0];
  const subscriberId = coverage?.subscriberId as string | undefined;

  return {
    firstName: name?.given?.[0] || "",
    lastName: name?.family || "",
    dateOfBirth: (patient?.birthDate as string) || "",
    gender: (patient?.gender as string) || "",
    memberId: subscriberId || "",
  };
}

function extractCoverage(
  coverage: Record<string, unknown> | null,
  request: PriorAuthRequest
) {
  const payor = (coverage?.payor as Array<{ display?: string }>)?.[0];
  const classes = coverage?.class as Array<{
    type?: { coding?: Array<{ code?: string }> };
    value?: string;
  }> | undefined;
  const groupClass = classes?.find((c) =>
    c.type?.coding?.some((coding) => coding.code === "group")
  );

  return {
    payerName: payor?.display || "",
    payerId: "",
    memberId: (coverage?.subscriberId as string) || "",
    groupNumber: groupClass?.value,
  };
}

function extractService(
  claim: Record<string, unknown> | null,
  request: PriorAuthRequest
) {
  // CPT codes from Claim.item[].productOrService.coding[].code
  const items = claim?.item as Array<{
    productOrService?: { coding?: Array<{ code?: string }>; text?: string };
    servicedDate?: string;
  }> | undefined;

  const cptCodes = items?.flatMap(
    (item) =>
      item.productOrService?.coding
        ?.map((c) => c.code)
        .filter((c): c is string => !!c) || []
  ) || request.cptCodes;

  // ICD-10 codes from Claim.diagnosis[].diagnosisCodeableConcept.coding[].code
  const diagnoses = claim?.diagnosis as Array<{
    diagnosisCodeableConcept?: { coding?: Array<{ code?: string }> };
  }> | undefined;

  const icd10Codes = diagnoses?.flatMap(
    (d) =>
      d.diagnosisCodeableConcept?.coding
        ?.map((c) => c.code)
        .filter((c): c is string => !!c) || []
  ) || request.icd10Codes;

  // Procedure description
  const procedureDescription =
    items?.[0]?.productOrService?.text ||
    request.procedureDescription ||
    "";

  // Urgency from Claim.priority
  const priorityCoding = (
    claim?.priority as { coding?: Array<{ code?: string }> }
  )?.coding?.[0]?.code;
  const urgency = mapFhirPriorityToUrgency(priorityCoding);

  // Scheduled date
  const scheduledDate = items?.[0]?.servicedDate || undefined;

  return {
    serviceType: request.serviceType || "",
    cptCodes,
    icd10Codes,
    procedureDescription,
    urgency,
    scheduledDate,
  };
}

function extractProvider(
  practitioner: Record<string, unknown> | null,
  organization: Record<string, unknown> | null
) {
  // Organization NPI
  const orgIdentifiers = organization?.identifier as Array<{
    system?: string;
    value?: string;
  }> | undefined;
  const orgNpi = orgIdentifiers?.find(
    (i) => i.system === "http://hl7.org/fhir/sid/us-npi"
  )?.value;

  // Practitioner NPI
  const practIdentifiers = practitioner?.identifier as Array<{
    system?: string;
    value?: string;
  }> | undefined;
  const practNpi = practIdentifiers?.find(
    (i) => i.system === "http://hl7.org/fhir/sid/us-npi"
  )?.value;

  // Practitioner name
  const practName = (
    practitioner?.name as Array<{ text?: string }>
  )?.[0]?.text;

  return {
    organizationName: (organization?.name as string) || "",
    npi: orgNpi || "",
    orderingProviderName: practName,
    orderingProviderNpi: practNpi,
  };
}

function extractClinicalNotes(
  claim: Record<string, unknown> | null
): string | undefined {
  const supportingInfo = claim?.supportingInfo as Array<{
    valueString?: string;
  }> | undefined;
  return supportingInfo?.[0]?.valueString;
}

function mapFhirPriorityToUrgency(
  priority: string | undefined
): "routine" | "urgent" | "emergent" {
  switch (priority) {
    case "stat":
      return "emergent";
    case "normal":
      return "urgent";
    case "deferred":
    default:
      return "routine";
  }
}

// ─── Main Mapper ───────────────────────────────────────────

export function mapBundleToClearinghouseRequest(
  bundle: Record<string, unknown>,
  transport: PayerTransport,
  request: PriorAuthRequest,
  credentials: ClearinghouseCredentials
): ClearinghouseSubmitRequest {
  const entries = (bundle.entry || []) as BundleEntry[];

  const patient = findResource(entries, "Patient");
  const coverage = findResource(entries, "Coverage");
  const claim = findResource(entries, "Claim");
  const practitioner = findResource(entries, "Practitioner");
  const organization = findResource(entries, "Organization");

  const patientData = extractPatient(patient, coverage, request);
  const insuranceData = extractCoverage(coverage, request);
  const serviceData = extractService(claim, request);
  const providerData = extractProvider(practitioner, organization);
  const clinicalNotes = extractClinicalNotes(claim);

  // Reference number from bundle identifier or request
  const referenceNumber =
    (bundle.identifier as { value?: string })?.value ||
    request.referenceNumber;

  return {
    clearinghousePayerId: transport.clearinghousePayerId || "",
    patient: patientData,
    provider: providerData,
    service: serviceData,
    insurance: insuranceData,
    referenceNumber,
    clinicalNotes,
    credentials,
    metadata: (transport.metadata as Record<string, unknown>)?.config as
      | Record<string, unknown>
      | undefined,
  };
}
