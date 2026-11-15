"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { splitCoordinates } from "@/lib/coords";
import { TARGETS } from "@/lib/targets";
import type { Target } from "@/lib/targets";
import { getApi } from "@/lib/viewer";

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ’'−-]/g, "").replace(/\s+/g, " ").toLowerCase().trim();

const COORDINATE_PART = /^[+\-−]?\d[\d\s.:hmsd°′'″"]*$/i;

const ALIASES: Record<string, string[]> = {
  barnards_star: ["barnard", "barnards star", "gj 699", "v2500 oph"],
  epsilon_indi_b: ["eps ind b", "epsilon indi", "eps indi b"],
  wise_0855: ["wise 0855", "wise j0855", "wise j085510.83", "0855"],
  rw_aurigae: ["rw aur", "rw aurigae"],
  r_draconis: ["r dra", "r draconis"],
};

export function matchTargets(text: string): Target[] {
  const q = fold(text);
  if (!q) return [...TARGETS];
  return TARGETS.filter((t) => fold(t.name).includes(q) || (ALIASES[t.id] ?? []).some((a) => a.includes(q) || q.includes(a)));
}

type Props = {
  open: boolean;
  onClose: () => void;
  onTarget: (target: Target) => void;
  onPosition: (raDeg: number, decDeg: number) => void;
};

export function SearchField({ open, onClose, onTarget, onPosition }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState(0);
  const parts = splitCoordinates(text);
  const looksLikeCoordinates = !!parts && COORDINATE_PART.test(parts[0]) && COORDINATE_PART.test(parts[1]);
  const suggestions = useMemo(() => (looksLikeCoordinates ? [] : matchTargets(text)), [text, looksLikeCoordinates]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setChoice(0);
    input.current?.focus();
    input.current?.select();
  }, [open]);

  useEffect(() => setChoice(0), [text]);

  if (!open) return null;

  const submit = async () => {
    const pick = suggestions[choice];
    if (pick && (!looksLikeCoordinates || !text.trim())) {
      onTarget(pick);
      onClose();
      return;
    }
    if (!parts || !looksLikeCoordinates) {
      setError(text.trim() ? "Type one of the five target names, or RA and Dec such as 17:57:48.5 +04:41:36 or 269.45, 4.69." : "Type a target name or coordinates.");
      return;
    }
    setBusy(true);
    try {
      const { ra_deg, dec_deg } = await getApi().resolve(parts[0], parts[1]);
      setError(null);
      onPosition(ra_deg, dec_deg);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message || "Those coordinates could not be read." : "Those coordinates could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search" role="search">
      <input
        ref={input}
        type="text"
        value={text}
        spellCheck={false}
        autoComplete="off"
        aria-label="Go to a target or coordinates"
        aria-describedby={error ? "search-error" : undefined}
        aria-invalid={!!error}
        aria-controls="search-suggestions"
        placeholder="A target, or RA and Dec"
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          else if (e.key === "Enter") void submit();
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = suggestions.length;
            if (n) setChoice((c) => (c + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
          }
        }}
      />
      {busy && <div className="search-note">Reading the coordinates…</div>}
      {error && (
        <div id="search-error" className="search-error" role="alert">
          {error}
        </div>
      )}
      {suggestions.length > 0 && (
        <ul id="search-suggestions" className="search-list" role="listbox" aria-label="Targets">
          {suggestions.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === choice}>
              <button
                type="button"
                tabIndex={-1}
                data-on={i === choice}
                onMouseEnter={() => setChoice(i)}
                onClick={() => {
                  onTarget(t);
                  onClose();
                }}
              >
                <span className="search-name">{t.name}</span>
                <span className="search-blurb">{t.blurb}</span>
                <kbd>{t.key}</kbd>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
