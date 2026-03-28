"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EhrFieldBadge } from "@/components/wizard/ehr-banner";
import type { QuestionnaireItem, QuestionnaireAnswer } from "@/lib/dtr/types";

interface QuestionnaireRendererProps {
  title: string;
  items: QuestionnaireItem[];
  answers: QuestionnaireAnswer[];
  onAnswerChange: (linkId: string, value: string | boolean | number | null) => void;
}

/**
 * Renders a FHIR Questionnaire as a form.
 * Supports: string, text, boolean, integer, decimal, date, choice, group, display.
 * Shows EHR badges on auto-populated fields.
 */
export function QuestionnaireRenderer({
  title,
  items,
  answers,
  onAnswerChange,
}: QuestionnaireRendererProps) {
  const answerMap = new Map(answers.map((a) => [a.linkId, a]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <Badge variant="info" size="sm">DTR</Badge>
      </div>

      {items.map((item) => (
        <QuestionnaireItemRenderer
          key={item.linkId}
          item={item}
          answerMap={answerMap}
          onAnswerChange={onAnswerChange}
        />
      ))}
    </div>
  );
}

function QuestionnaireItemRenderer({
  item,
  answerMap,
  onAnswerChange,
}: {
  item: QuestionnaireItem;
  answerMap: Map<string, QuestionnaireAnswer>;
  onAnswerChange: (linkId: string, value: string | boolean | number | null) => void;
}) {
  const answer = answerMap.get(item.linkId);

  // Display items — just text
  if (item.type === "display") {
    return (
      <p className="text-xs text-text-muted italic px-1">{item.text}</p>
    );
  }

  // Group items — render header + children
  if (item.type === "group") {
    return (
      <div className="space-y-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          {item.text}
        </h4>
        {item.item?.map((child) => (
          <QuestionnaireItemRenderer
            key={child.linkId}
            item={child}
            answerMap={answerMap}
            onAnswerChange={onAnswerChange}
          />
        ))}
      </div>
    );
  }

  const currentValue = answer?.value ?? "";
  const isAutoFilled = answer?.autoPopulated ?? false;

  // Boolean
  if (item.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentValue === true}
            onChange={(e) => onAnswerChange(item.linkId, e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/40"
          />
          <span className="text-sm text-text-secondary">
            {item.text}
            {item.required && <span className="text-red-400 ml-0.5">*</span>}
          </span>
        </label>
        {isAutoFilled && <EhrFieldBadge />}
      </div>
    );
  }

  // Choice / Open-Choice
  if (item.type === "choice" || item.type === "open-choice") {
    const options = (item.answerOption || []).map((opt) => ({
      value: opt.valueCoding?.code || opt.valueString || "",
      label: opt.valueCoding?.display || opt.valueString || "",
    }));

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Select
            label={`${item.text}${item.required ? " *" : ""}`}
            options={options}
            placeholder="Select..."
            value={String(currentValue)}
            onChange={(e) => onAnswerChange(item.linkId, e.target.value)}
          />
          {isAutoFilled && <EhrFieldBadge />}
        </div>
      </div>
    );
  }

  // Text (multiline)
  if (item.type === "text") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-text-secondary">
            {item.text}{item.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {isAutoFilled && <EhrFieldBadge />}
        </div>
        <textarea
          value={String(currentValue)}
          onChange={(e) => onAnswerChange(item.linkId, e.target.value)}
          rows={3}
          readOnly={item.readOnly}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 resize-none"
        />
      </div>
    );
  }

  // Date
  if (item.type === "date") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-text-secondary">
            {item.text}{item.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {isAutoFilled && <EhrFieldBadge />}
        </div>
        <input
          type="date"
          value={String(currentValue)}
          onChange={(e) => onAnswerChange(item.linkId, e.target.value)}
          readOnly={item.readOnly}
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all duration-200 [color-scheme:dark]"
        />
      </div>
    );
  }

  // String, integer, decimal — all use Input
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Input
          label={`${item.text}${item.required ? " *" : ""}`}
          type={item.type === "integer" || item.type === "decimal" ? "number" : "text"}
          value={String(currentValue)}
          onChange={(e) => {
            const v = e.target.value;
            if (item.type === "integer") onAnswerChange(item.linkId, v ? parseInt(v, 10) : null);
            else if (item.type === "decimal") onAnswerChange(item.linkId, v ? parseFloat(v) : null);
            else onAnswerChange(item.linkId, v || null);
          }}
          readOnly={item.readOnly}
        />
      </div>
      {isAutoFilled && <div className="pb-2"><EhrFieldBadge /></div>}
    </div>
  );
}
