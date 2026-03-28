import type Client from "fhirclient/lib/Client";
import type {
  IPatient,
  IBundle,
  ICoverage,
  ICondition,
  IServiceRequest,
  IPractitioner,
  IDocumentReference,
  IObservation,
} from "@smile-cdr/fhirts/dist/FHIR-R4/interfaces/IModel";

/** Minimal FHIR Reference type (not separately exported by @smile-cdr/fhirts) */
interface FhirReference {
  reference?: string;
  display?: string;
  identifier?: { value?: string };
}
import type {
  FhirPatientData,
  FhirCoverageData,
  FhirConditionData,
  FhirServiceRequestData,
  FhirPractitionerData,
  FhirDocumentData,
  FhirObservationData,
  FhirContext,
} from "./types";

// ─── FHIR Resource → GreenLight Mappers ──────────────────────

/**
 * Extracts all relevant FHIR data from an authenticated SMART client
 * and returns a FhirContext ready for wizard auto-fill.
 */
export async function extractFhirContext(
  client: Client
): Promise<FhirContext> {
  const patientId = client.patient.id;
  if (!patientId) {
    throw new Error("No patient context available from EHR launch");
  }

  // Fetch resources in parallel — each one is best-effort
  const [patient, coverages, conditions, serviceRequests, documents, observations] =
    await Promise.allSettled([
      client.patient.read() as Promise<IPatient>,
      client
        .request<IBundle>(
          `Coverage?patient=${patientId}&status=active&_sort=-_lastUpdated&_count=5`
        )
        .catch(() => null),
      client
        .request<IBundle>(
          `Condition?patient=${patientId}&clinical-status=active&_sort=-_lastUpdated&_count=20`
        )
        .catch(() => null),
      client
        .request<IBundle>(
          `ServiceRequest?patient=${patientId}&status=active,draft&_sort=-_lastUpdated&_count=5`
        )
        .catch(() => null),
      client
        .request<IBundle>(
          `DocumentReference?patient=${patientId}&status=current&_sort=-date&_count=10`
        )
        .catch(() => null),
      client
        .request<IBundle>(
          `Observation?patient=${patientId}&category=laboratory&_sort=-date&_count=20`
        )
        .catch(() => null),
    ]);

  // Extract the service request first so we can resolve the requester
  const sr =
    serviceRequests.status === "fulfilled" && serviceRequests.value
      ? mapFirstServiceRequest(serviceRequests.value)
      : null;

  // Try to resolve the ordering practitioner from the ServiceRequest.requester
  let practitioner: FhirPractitionerData | null = null;
  if (serviceRequests.status === "fulfilled" && serviceRequests.value) {
    const srResource = serviceRequests.value.entry?.find(
      (e) => e.resource?.resourceType === "ServiceRequest"
    )?.resource as IServiceRequest | undefined;

    if (srResource?.requester?.reference) {
      practitioner = await fetchPractitioner(client, srResource.requester.reference);
    }
  }

  // Fallback: try fhirUser from the auth context (the logged-in clinician)
  if (!practitioner && client.state.tokenResponse?.fhirUser) {
    const fhirUser = client.state.tokenResponse.fhirUser as string;
    if (fhirUser.includes("Practitioner")) {
      practitioner = await fetchPractitioner(client, fhirUser);
    }
  }

  return {
    fhirBaseUrl: client.state.serverUrl,
    patientId,
    patient:
      patient.status === "fulfilled"
        ? mapPatient(patient.value)
        : null,
    coverage:
      coverages.status === "fulfilled" && coverages.value
        ? mapFirstCoverage(coverages.value)
        : null,
    conditions:
      conditions.status === "fulfilled" && conditions.value
        ? mapConditions(conditions.value)
        : [],
    serviceRequest: sr,
    practitioner,
    documents:
      documents.status === "fulfilled" && documents.value
        ? mapDocuments(documents.value)
        : [],
    observations:
      observations.status === "fulfilled" && observations.value
        ? mapObservations(observations.value)
        : [],
    createdAt: new Date().toISOString(),
  };
}

// ─── Individual Resource Mappers ─────────────────────────────

function mapPatient(resource: IPatient): FhirPatientData {
  const officialName =
    resource.name?.find((n) => n.use === "official") || resource.name?.[0];

  const firstName = officialName?.given?.join(" ") || "";
  const lastName = officialName?.family || "";

  // Extract MRN from identifiers (type code = "MR")
  const mrn =
    resource.identifier?.find((id) =>
      id.type?.coding?.some((c) => c.code === "MR")
    )?.value || null;

  // Extract phone and email from telecom
  const phone =
    resource.telecom?.find((t) => t.system === "phone")?.value || null;
  const email =
    resource.telecom?.find((t) => t.system === "email")?.value || null;

  return {
    fhirId: resource.id || "",
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    mrn,
    dob: resource.birthDate || "",
    gender: mapGender(resource.gender),
    phone,
    email,
  };
}

function mapGender(
  fhirGender: string | undefined
): string {
  switch (fhirGender) {
    case "male":
      return "male";
    case "female":
      return "female";
    case "other":
      return "other";
    default:
      return "unknown";
  }
}

function mapFirstCoverage(bundle: IBundle): FhirCoverageData | null {
  const resource = bundle.entry?.find(
    (e) => e.resource?.resourceType === "Coverage"
  )?.resource as ICoverage | undefined;

  if (!resource) return null;

  // Payer is typically in resource.payor (note: FHIR R4 uses "payor" spelling)
  const payorRef = resource.payor?.[0];
  const payerName =
    payorRef?.display || extractReferenceDisplay(payorRef) || "Unknown Payer";

  // Member ID from subscriber ID or identifier
  const memberId =
    resource.subscriberId ||
    resource.identifier?.find((id) =>
      id.type?.coding?.some((c) => c.code === "MB")
    )?.value ||
    null;

  // Group number
  const groupNumber =
    resource.class?.find(
      (c) => c.type?.coding?.some((cd) => cd.code === "group")
    )?.value || null;

  return {
    fhirId: resource.id || "",
    payerName,
    payerIdentifier:
      payorRef?.identifier?.value || null,
    planName:
      resource.class?.find(
        (c) => c.type?.coding?.some((cd) => cd.code === "plan")
      )?.name || null,
    memberId,
    groupNumber,
    subscriberId: resource.subscriberId || null,
    relationship: resource.relationship?.coding?.[0]?.code || null,
  };
}

function mapConditions(bundle: IBundle): FhirConditionData[] {
  if (!bundle.entry) return [];

  return bundle.entry
    .map((e) => e.resource as ICondition | undefined)
    .filter((r): r is ICondition => r?.resourceType === "Condition")
    .map((resource) => {
      // Prefer ICD-10 coding
      const icd10Coding = resource.code?.coding?.find(
        (c) =>
          c.system === "http://hl7.org/fhir/sid/icd-10-cm" ||
          c.system === "http://hl7.org/fhir/sid/icd-10"
      );
      const coding = icd10Coding || resource.code?.coding?.[0];

      return {
        fhirId: resource.id || "",
        code: coding?.code || "",
        display: coding?.display || resource.code?.text || "",
        clinicalStatus:
          resource.clinicalStatus?.coding?.[0]?.code || "unknown",
        onsetDate:
          (resource.onsetDateTime
            ? String(resource.onsetDateTime)
            : resource.onsetPeriod?.start
              ? String(resource.onsetPeriod.start)
              : null),
      };
    })
    .filter((c) => c.code); // Only include conditions with actual codes
}

function mapFirstServiceRequest(
  bundle: IBundle
): FhirServiceRequestData | null {
  const resource = bundle.entry?.find(
    (e) => e.resource?.resourceType === "ServiceRequest"
  )?.resource as IServiceRequest | undefined;

  if (!resource) return null;

  // Extract CPT codes from the code field
  const cptCodes = (resource.code?.coding || [])
    .filter(
      (c) =>
        c.system === "http://www.ama-assn.org/go/cpt" ||
        c.system === "urn:oid:2.16.840.1.113883.6.12"
    )
    .map((c) => c.code!)
    .filter(Boolean);

  // Extract reason codes (ICD-10)
  const reasonCodes = (resource.reasonCode || [])
    .flatMap((rc) => rc.coding || [])
    .filter(
      (c) =>
        c.system === "http://hl7.org/fhir/sid/icd-10-cm" ||
        c.system === "http://hl7.org/fhir/sid/icd-10"
    )
    .map((c) => c.code!)
    .filter(Boolean);

  // Map FHIR priority to GreenLight urgency
  let priority: string | null = null;
  if (resource.priority === "stat" || resource.priority === "asap") {
    priority = "emergent";
  } else if (resource.priority === "urgent") {
    priority = "urgent";
  } else if (resource.priority === "routine") {
    priority = "routine";
  }

  return {
    fhirId: resource.id || "",
    status: resource.status || "",
    intent: resource.intent || "",
    cptCodes,
    procedureDescription:
      resource.code?.text ||
      resource.code?.coding?.[0]?.display ||
      null,
    reasonCodes,
    priority,
    occurrenceDate:
      (resource.occurrenceDateTime
        ? String(resource.occurrenceDateTime)
        : resource.occurrencePeriod?.start
          ? String(resource.occurrencePeriod.start)
          : null),
  };
}

// ─── Phase 2 Mappers: Practitioner, DocumentReference, Observation ──

async function fetchPractitioner(
  client: Client,
  reference: string
): Promise<FhirPractitionerData | null> {
  try {
    const resource = await client.request<IPractitioner>(reference);
    if (!resource || resource.resourceType !== "Practitioner") return null;

    const officialName =
      resource.name?.find((n) => n.use === "official") || resource.name?.[0];
    const name = officialName
      ? `${officialName.given?.join(" ") || ""} ${officialName.family || ""}`.trim()
      : "";

    // Extract NPI from identifiers
    const npi =
      resource.identifier?.find(
        (id) => id.system === "http://hl7.org/fhir/sid/us-npi"
      )?.value || null;

    // Extract specialty from qualification
    const specialty =
      resource.qualification?.[0]?.code?.coding?.[0]?.display ||
      resource.qualification?.[0]?.code?.text ||
      null;

    return {
      fhirId: resource.id || "",
      name,
      npi,
      specialty,
    };
  } catch {
    return null;
  }
}

function mapDocuments(bundle: IBundle): FhirDocumentData[] {
  if (!bundle.entry) return [];

  return bundle.entry
    .map((e) => e.resource as IDocumentReference | undefined)
    .filter((r): r is IDocumentReference => r?.resourceType === "DocumentReference")
    .map((resource) => {
      const typeCoding = resource.type?.coding?.[0];
      const content = resource.content?.[0];

      return {
        fhirId: resource.id || "",
        type: typeCoding?.display || resource.type?.text || "Clinical Document",
        description: resource.description || null,
        date: resource.date ? String(resource.date) : null,
        status: resource.status || "current",
        contentUrl: content?.attachment?.url || null,
        contentType: content?.attachment?.contentType || null,
      };
    })
    .slice(0, 10); // Limit to 10 most recent
}

function mapObservations(bundle: IBundle): FhirObservationData[] {
  if (!bundle.entry) return [];

  return bundle.entry
    .map((e) => e.resource as IObservation | undefined)
    .filter((r): r is IObservation => r?.resourceType === "Observation")
    .map((resource) => {
      const coding = resource.code?.coding?.[0];

      // Extract value — handle different FHIR value types
      let value: string | null = null;
      let unit: string | null = null;

      if (resource.valueQuantity) {
        value = String(resource.valueQuantity.value ?? "");
        unit = resource.valueQuantity.unit || resource.valueQuantity.code || null;
      } else if (resource.valueString) {
        value = resource.valueString;
      } else if (resource.valueCodeableConcept) {
        value = resource.valueCodeableConcept.text ||
          resource.valueCodeableConcept.coding?.[0]?.display || null;
      }

      const category =
        resource.category?.[0]?.coding?.[0]?.code || null;

      return {
        fhirId: resource.id || "",
        code: coding?.code || "",
        display: coding?.display || resource.code?.text || "",
        value,
        unit,
        date: resource.effectiveDateTime
          ? String(resource.effectiveDateTime)
          : resource.effectivePeriod?.start
            ? String(resource.effectivePeriod.start)
            : null,
        status: resource.status || "final",
        category,
      };
    })
    .filter((o) => o.code) // Only observations with codes
    .slice(0, 20); // Limit to 20 most recent
}

// ─── Helpers ─────────────────────────────────────────────────

function extractReferenceDisplay(
  ref: FhirReference | undefined
): string | null {
  if (!ref) return null;
  return ref.display || null;
}
