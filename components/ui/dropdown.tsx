"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}

export function Dropdown({ trigger, children, align = "left" }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus first menu item when opened
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLButtonElement>(
        '[role="menuitem"]'
      );
      firstItem?.focus();
    }
  }, [isOpen]);

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleMenuKeyDown = (e: KeyboardEvent) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]'
    );
    if (!items || items.length === 0) return;

    const currentIndex = Array.from(items).findIndex(
      (item) => item === document.activeElement
    );

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex]?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex]?.focus();
        break;
      }
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      case "Home": {
        e.preventDefault();
        items[0]?.focus();
        break;
      }
      case "End": {
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }
    }
  };

  // Clone the trigger element to attach ref and aria attributes
  const triggerElement =
    isValidElement(trigger) &&
    cloneElement(trigger as ReactElement<Record<string, unknown>>, {
      ref: triggerRef,
      "aria-haspopup": "menu" as const,
      "aria-expanded": isOpen,
      "aria-label":
        (trigger as ReactElement<Record<string, unknown>>).props?.["aria-label"] ||
        "Open menu",
    });

  return (
    <div ref={dropdownRef} className="relative">
      <div
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
      >
        {triggerElement || trigger}
      </div>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
          className={`
            absolute top-full mt-2 z-50 min-w-[200px]
            bg-dark-700 border border-border-default rounded-xl
            shadow-2xl shadow-black/50
            animate-fade-in overflow-hidden
            ${align === "right" ? "right-0" : "left-0"}
          `}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  children: ReactNode;
  variant?: "default" | "danger";
}

export function DropdownItem({ onClick, children, variant = "default" }: DropdownItemProps) {
  return (
    <button
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={`
        w-full px-4 py-2.5 text-sm text-left flex items-center gap-2
        transition-colors outline-none
        focus-visible:bg-white/10
        ${
          variant === "danger"
            ? "text-red-400 hover:bg-red-500/10 focus-visible:bg-red-500/10"
            : "text-text-secondary hover:text-text-primary hover:bg-white/5"
        }
      `}
    >
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div role="separator" className="border-t border-white/10 my-1" />;
}
