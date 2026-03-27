"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "./badge";

interface MultiSelectProps {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ label, options, selected, onChange, placeholder = "Select..." }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const removeOption = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  const selectedLabels = selected.map((v) => options.find((o) => o.value === v)?.label || v);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-full px-4 py-2.5 rounded-lg text-left
            bg-white/5 border border-white/10
            text-text-primary
            focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40
            transition-all duration-200
            flex items-center justify-between gap-2 min-h-[42px]
          `}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.length === 0 ? (
              <span className="text-text-muted">{placeholder}</span>
            ) : (
              selectedLabels.map((label, i) => (
                <Badge
                  key={selected[i]}
                  variant="info"
                  size="sm"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOption(selected[i]);
                  }}
                >
                  {label}
                  <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Badge>
              ))
            )}
          </div>
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-lg bg-dark-600 border border-white/10 shadow-xl max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleOption(option.value)}
                className={`
                  w-full px-4 py-2 text-left text-sm flex items-center gap-2
                  hover:bg-white/5 transition-colors
                  ${selected.includes(option.value) ? "text-emerald-400" : "text-text-primary"}
                `}
              >
                <div
                  className={`
                    w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                    ${selected.includes(option.value)
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-white/20 bg-transparent"
                    }
                  `}
                >
                  {selected.includes(option.value) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
