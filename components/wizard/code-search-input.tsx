"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CodeOption {
  code: string;
  description: string;
}

interface CodeSearchInputProps {
  label: string;
  placeholder: string;
  selectedCodes: string[];
  onCodesChange: (codes: string[]) => void;
  searchFn: (query: string) => Promise<CodeOption[]>;
  error?: string;
}

export function CodeSearchInput({
  label,
  placeholder,
  selectedCodes,
  onCodesChange,
  searchFn,
  error,
}: CodeSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CodeOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 1) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const items = await searchFn(q);
        setResults(items.filter((item) => !selectedCodes.includes(item.code)));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchFn, selectedCodes]
  );

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addCode = (code: string) => {
    if (!selectedCodes.includes(code)) {
      onCodesChange([...selectedCodes, code]);
    }
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeCode = (code: string) => {
    onCodesChange(selectedCodes.filter((c) => c !== code));
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="block text-sm font-medium text-text-secondary">{label}</label>

      {/* Selected codes */}
      {selectedCodes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono"
            >
              {code}
              <button
                type="button"
                onClick={() => removeCode(code)}
                className="text-emerald-400/60 hover:text-emerald-400 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 1) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`
            w-full px-4 py-2.5 rounded-lg
            bg-white/5 border border-white/10
            text-text-primary placeholder:text-text-muted
            focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40
            transition-all duration-200
            ${error ? "border-red-500/50 focus:ring-red-500/40" : ""}
          `}
        />

        {/* Dropdown results */}
        {isOpen && (results.length > 0 || loading) && (
          <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-dark-700 border border-white/10 shadow-xl">
            {loading ? (
              <div className="px-4 py-3 text-sm text-text-muted">Searching...</div>
            ) : (
              results.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => addCode(item.code)}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
                >
                  <span className="font-mono text-sm text-emerald-400">{item.code}</span>
                  <span className="ml-2 text-sm text-text-secondary">{item.description}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
