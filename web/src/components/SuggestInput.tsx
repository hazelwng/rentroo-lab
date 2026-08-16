"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Suggestion, suggestPlaces } from "@/lib/api";

/**
 * Text input with debounced geocoder suggestions
 */
export function SuggestInput({
  value,
  onValueChange,
  onPick,
  placeholder,
  name,
  autoFocus,
  required,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onPick: (s: Suggestion) => void;
  placeholder?: string;
  name?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    onValueChange(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const found = await suggestPlaces(q.trim());
        setSuggestions(found);
        setOpen(found.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);
  }

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={handleChange}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
        placeholder={placeholder}
        className="w-full border-2 border-per-300 bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
      />
      {open && (
        <ul className="absolute inset-x-0 top-full z-10 -mt-0.5 border-2 border-ink bg-paper">
          {suggestions.map((s, i) => (
            <li key={i}>
              {/* onMouseDown fires before the input's blur, so the pick wins */}
              <button
                type="button"
                onMouseDown={() => {
                  onPick(s);
                  setOpen(false);
                }}
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-per-100"
              >
                {s.display_name}
                {s.suburb && <span className="text-per-500"> · {s.suburb}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
