import type { QuestionnaireAnswer, QuestionnaireResponseData, PayerQuestionnaire } from "./types";

/**
 * Generates a FHIR R4 QuestionnaireResponse resource from completed answers.
 * This is included in the PAS submission bundle (Sprint 12).
 *
 * Spec: https://hl7.org/fhir/R4/questionnaireresponse.html
 */
export function buildFhirQuestionnaireResponse(
  questionnaire: PayerQuestionnaire,
  answers: QuestionnaireAnswer[],
  patientId: string
): Record<string, unknown> {
  const answerMap = new Map(answers.map((a) => [a.linkId, a]));

  return {
    resourceType: "QuestionnaireResponse",
    questionnaire: questionnaire.url || questionnaire.id,
    status: answers.every((a) => a.value !== null) ? "completed" : "in-progress",
    authored: new Date().toISOString(),
    subject: {
      reference: `Patient/${patientId}`,
    },
    item: questionnaire.item
      .filter((item) => item.type !== "display")
      .map((item) => buildResponseItem(item, answerMap))
      .filter(Boolean),
  };
}

function buildResponseItem(
  item: { linkId: string; text: string; type: string; item?: Array<{ linkId: string; text: string; type: string }> },
  answerMap: Map<string, QuestionnaireAnswer>
): Record<string, unknown> | null {
  // Group items
  if (item.type === "group" && item.item) {
    const children = item.item
      .map((child) => buildResponseItem(child, answerMap))
      .filter(Boolean);

    if (children.length === 0) return null;

    return {
      linkId: item.linkId,
      text: item.text,
      item: children,
    };
  }

  const answer = answerMap.get(item.linkId);
  if (!answer || answer.value === null) return null;

  return {
    linkId: item.linkId,
    text: item.text,
    answer: [formatAnswerValue(answer.value, item.type)],
  };
}

function formatAnswerValue(
  value: string | boolean | number,
  type: string
): Record<string, unknown> {
  switch (type) {
    case "boolean":
      return { valueBoolean: Boolean(value) };
    case "integer":
      return { valueInteger: Number(value) };
    case "decimal":
      return { valueDecimal: Number(value) };
    case "date":
      return { valueDate: String(value) };
    case "choice":
    case "open-choice":
      return {
        valueCoding: {
          code: String(value),
          display: String(value),
        },
      };
    default:
      return { valueString: String(value) };
  }
}

/**
 * Converts a QuestionnaireResponseData (our internal format) into
 * a serializable format for storage in wizard state.
 */
export function serializeResponseData(
  questionnaire: PayerQuestionnaire,
  answers: QuestionnaireAnswer[]
): QuestionnaireResponseData {
  return {
    questionnaireId: questionnaire.id,
    questionnaireTitle: questionnaire.title,
    status: answers.every((a) => a.value !== null || !isRequired(questionnaire, a.linkId))
      ? "completed"
      : "in-progress",
    authored: new Date().toISOString(),
    answers,
  };
}

function isRequired(q: PayerQuestionnaire, linkId: string): boolean {
  const findItem = (items: Array<{ linkId: string; required?: boolean; item?: Array<{ linkId: string; required?: boolean }> }>): boolean => {
    for (const item of items) {
      if (item.linkId === linkId) return item.required || false;
      if (item.item && findItem(item.item)) return true;
    }
    return false;
  };
  return findItem(q.item);
}
