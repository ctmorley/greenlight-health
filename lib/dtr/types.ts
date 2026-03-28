// ─── Da Vinci DTR Types ─────────────────────────────────────
// Simplified FHIR Questionnaire / QuestionnaireResponse types
// for payer documentation requirements.

/**
 * A simplified FHIR Questionnaire item.
 * Full spec: https://hl7.org/fhir/R4/questionnaire.html
 */
export interface QuestionnaireItem {
  linkId: string;
  text: string;
  type: "string" | "text" | "boolean" | "integer" | "decimal" | "date" | "choice" | "open-choice" | "group" | "display";
  required?: boolean;
  repeats?: boolean;
  readOnly?: boolean;
  /** For choice/open-choice items */
  answerOption?: Array<{
    valueCoding?: { code: string; display: string; system?: string };
    valueString?: string;
  }>;
  /** Nested items (for group type) */
  item?: QuestionnaireItem[];
  /** Extension for auto-population hints */
  extension?: Array<{
    url: string;
    valueExpression?: {
      language: string;
      expression: string;
    };
  }>;
}

/**
 * A payer-published questionnaire for documentation requirements.
 */
export interface PayerQuestionnaire {
  id: string;
  url?: string;
  title: string;
  status: "draft" | "active" | "retired";
  /** Which payer published this */
  publisher?: string;
  /** Service categories this applies to */
  serviceCategories: string[];
  /** CPT codes this applies to (empty = all in category) */
  cptCodes: string[];
  item: QuestionnaireItem[];
}

/**
 * An answer to a single questionnaire item.
 */
export interface QuestionnaireAnswer {
  linkId: string;
  text: string;
  value: string | boolean | number | null;
  /** Whether this was auto-populated from EHR data */
  autoPopulated: boolean;
}

/**
 * Complete set of answers for a questionnaire.
 */
export interface QuestionnaireResponseData {
  questionnaireId: string;
  questionnaireTitle: string;
  status: "in-progress" | "completed";
  authored: string;
  answers: QuestionnaireAnswer[];
}
