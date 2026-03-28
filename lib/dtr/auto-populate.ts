import type { FhirContext } from "@/lib/fhir/types";
import type { QuestionnaireItem, QuestionnaireAnswer } from "./types";

/**
 * CQL-lite auto-population engine.
 *
 * Maps common questionnaire items to answers from FHIR context data.
 * Uses linkId conventions and extension expressions to determine
 * which FHIR data to use. This replaces a full CQL engine for the
 * most common PA documentation patterns.
 *
 * Future: integrate cql-execution library for full CQL support.
 */
export function autoPopulateAnswers(
  items: QuestionnaireItem[],
  fhirContext: FhirContext | null
): QuestionnaireAnswer[] {
  if (!fhirContext) return items.map((item) => emptyAnswer(item));

  return items.flatMap((item) => populateItem(item, fhirContext));
}

function populateItem(
  item: QuestionnaireItem,
  ctx: FhirContext
): QuestionnaireAnswer[] {
  // Skip display-only items
  if (item.type === "display") return [];

  // Recurse into groups
  if (item.type === "group" && item.item) {
    return item.item.flatMap((child) => populateItem(child, ctx));
  }

  // Try to auto-populate based on linkId conventions and extensions
  const value = resolveValue(item, ctx);

  return [
    {
      linkId: item.linkId,
      text: item.text,
      value,
      autoPopulated: value !== null,
    },
  ];
}

/**
 * Resolves a value for a questionnaire item from FHIR context.
 * Uses linkId naming conventions (common in payer questionnaires)
 * and CQL-like extension expressions.
 */
function resolveValue(
  item: QuestionnaireItem,
  ctx: FhirContext
): string | boolean | number | null {
  const linkId = item.linkId.toLowerCase();

  // Check for CQL expression extension first
  const cqlExpression = item.extension?.find(
    (e) =>
      e.url === "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression" ||
      e.url === "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression"
  )?.valueExpression?.expression;

  if (cqlExpression) {
    const cqlResult = evaluateSimpleCql(cqlExpression, ctx);
    if (cqlResult !== null) return cqlResult;
  }

  // ── Patient Demographics ──
  if (linkId.includes("patient") && linkId.includes("name")) {
    return ctx.patient?.fullName || null;
  }
  if (linkId.includes("patient") && linkId.includes("dob")) {
    return ctx.patient?.dob || null;
  }
  if (linkId.includes("patient") && linkId.includes("gender") || linkId.includes("sex")) {
    return ctx.patient?.gender || null;
  }
  if (linkId.includes("mrn") || linkId.includes("medical-record")) {
    return ctx.patient?.mrn || null;
  }
  if (linkId.includes("member") && linkId.includes("id")) {
    return ctx.coverage?.memberId || null;
  }

  // ── Diagnosis / Conditions ──
  if (linkId.includes("diagnosis") || linkId.includes("icd") || linkId.includes("condition")) {
    if (ctx.conditions.length > 0) {
      return ctx.conditions.map((c) => `${c.code} - ${c.display}`).join("; ");
    }
    return null;
  }
  if (linkId.includes("primary") && linkId.includes("diag")) {
    return ctx.conditions[0]
      ? `${ctx.conditions[0].code} - ${ctx.conditions[0].display}`
      : null;
  }

  // ── Procedure / Service ──
  if (linkId.includes("procedure") || linkId.includes("service") && linkId.includes("desc")) {
    return ctx.serviceRequest?.procedureDescription || null;
  }
  if (linkId.includes("cpt") || linkId.includes("procedure") && linkId.includes("code")) {
    return ctx.serviceRequest?.cptCodes.join(", ") || null;
  }

  // ── Ordering Provider ──
  if (linkId.includes("provider") || linkId.includes("physician") || linkId.includes("practitioner")) {
    if (linkId.includes("npi")) {
      return ctx.practitioner?.npi || null;
    }
    return ctx.practitioner?.name || null;
  }

  // ── Insurance / Coverage ──
  if (linkId.includes("payer") || linkId.includes("insurance") && linkId.includes("name")) {
    return ctx.coverage?.payerName || null;
  }
  if (linkId.includes("plan") && linkId.includes("name")) {
    return ctx.coverage?.planName || null;
  }
  if (linkId.includes("group") && linkId.includes("number")) {
    return ctx.coverage?.groupNumber || null;
  }
  if (linkId.includes("subscriber")) {
    return ctx.coverage?.subscriberId || null;
  }

  // ── Clinical Urgency ──
  if (linkId.includes("urgency") || linkId.includes("priority")) {
    return ctx.serviceRequest?.priority || null;
  }

  // ── Dates ──
  if (linkId.includes("service") && linkId.includes("date") || linkId.includes("scheduled")) {
    return ctx.serviceRequest?.occurrenceDate?.split("T")[0] || null;
  }
  if (linkId.includes("onset")) {
    return ctx.conditions[0]?.onsetDate?.split("T")[0] || null;
  }

  // ── Lab Values ──
  if (linkId.includes("lab") || linkId.includes("observation")) {
    if (ctx.observations.length > 0) {
      return ctx.observations
        .filter((o) => o.value)
        .slice(0, 5)
        .map((o) => `${o.display}: ${o.value}${o.unit ? ` ${o.unit}` : ""}`)
        .join("; ");
    }
    return null;
  }

  return null;
}

/**
 * Evaluates simple CQL-like expressions from questionnaire extensions.
 * Handles the most common patterns payers use in DTR questionnaires.
 * Not a full CQL engine — covers ~80% of real-world cases.
 */
function evaluateSimpleCql(
  expression: string,
  ctx: FhirContext
): string | boolean | number | null {
  const expr = expression.trim();

  // Patient.name
  if (expr.includes("Patient.name")) {
    return ctx.patient?.fullName || null;
  }
  // Patient.birthDate
  if (expr.includes("Patient.birthDate")) {
    return ctx.patient?.dob || null;
  }
  // Patient.gender
  if (expr.includes("Patient.gender")) {
    return ctx.patient?.gender || null;
  }
  // Coverage.subscriberId
  if (expr.includes("Coverage.subscriberId")) {
    return ctx.coverage?.subscriberId || null;
  }
  // Condition.code
  if (expr.includes("Condition") && expr.includes("code")) {
    return ctx.conditions[0]?.code || null;
  }
  // ServiceRequest.code
  if (expr.includes("ServiceRequest") && expr.includes("code")) {
    return ctx.serviceRequest?.cptCodes[0] || null;
  }

  return null;
}

function emptyAnswer(item: QuestionnaireItem): QuestionnaireAnswer {
  return {
    linkId: item.linkId,
    text: item.text,
    value: null,
    autoPopulated: false,
  };
}
