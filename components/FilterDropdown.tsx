"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface FilterDropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
  className = "",
  searchable = false,
  searchPlaceholder = "Search…",
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const buttonId = useId();
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? options[0];
  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const needle = query.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const selectedIndex = Math.max(
      0,
      filtered.findIndex((option) => option.value === value)
    );
    setActiveIndex(selectedIndex);
    const frame = requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus();
      else listRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, filtered, searchable, value]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function moveActive(delta: number) {
    if (filtered.length === 0) return;
    setActiveIndex((current) => (current + delta + filtered.length) % filtered.length);
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option.value);
    }
  }

  const hasIcon = Boolean(selected?.icon);

  return (
    <div
      ref={rootRef}
      className={`filter-select ${hasIcon ? "eeveelution-select" : ""} ${className}`.trim()}
    >
      <button
        type="button"
        id={buttonId}
        className="filter-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onButtonKeyDown}
      >
        {hasIcon ? <span className="eeveelution-select-icon">{selected.icon}</span> : null}
        <span className="filter-select-label">{selected?.label ?? "Select"}</span>
      </button>

      {open ? (
        <div className="filter-menu" role="presentation">
          {searchable ? (
            <input
              ref={searchRef}
              type="search"
              className="filter-menu-search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onListKeyDown}
              aria-label={`Search ${label}`}
            />
          ) : null}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            aria-labelledby={buttonId}
            aria-activedescendant={
              filtered[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
            }
            className="filter-menu-list"
            onKeyDown={onListKeyDown}
          >
            {filtered.length === 0 ? (
              <div className="filter-menu-empty">No matching sets</div>
            ) : (
              filtered.map((option, index) => {
                const selectedOption = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    id={`${listId}-opt-${index}`}
                    role="option"
                    data-index={index}
                    aria-selected={selectedOption}
                    className={`filter-menu-option${selectedOption ? " is-selected" : ""}${
                      index === activeIndex ? " is-active" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option.value)}
                  >
                    {option.icon ? (
                      <span className="filter-menu-option-icon">{option.icon}</span>
                    ) : null}
                    <span>{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
