"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useShortcutsSuspended } from "@/components/shortcuts/shortcuts-provider";

type ReaderPreferences = {
  size: "small" | "medium" | "large";
  width: "narrow" | "comfortable" | "wide";
  font: "serif" | "sans";
};
const defaults: ReaderPreferences = { size: "medium", width: "comfortable", font: "serif" };
export const READER_PREFERENCES_KEY = "distil.reader.preferences";
type SummaryAction = { regenerate: () => void; disabled: boolean } | null;
const ReaderContext = createContext<{
  preferences: ReaderPreferences;
  updatePreferences: (patch: Partial<ReaderPreferences>) => void;
  summaryAction: SummaryAction;
  setSummaryAction: React.Dispatch<React.SetStateAction<SummaryAction>>;
} | null>(null);
export const useReaderExperience = () => useContext(ReaderContext);

function subscribePreferences(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
function storedPreferences() {
  try {
    return localStorage.getItem(READER_PREFERENCES_KEY);
  } catch {
    return null;
  }
}
function parsePreferences(value: string | null): ReaderPreferences {
  try {
    const stored = JSON.parse(value || "null");
    if (stored)
      return {
        size: ["small", "medium", "large"].includes(stored.size) ? stored.size : defaults.size,
        width: ["narrow", "comfortable", "wide"].includes(stored.width)
          ? stored.width
          : defaults.width,
        font: ["serif", "sans"].includes(stored.font) ? stored.font : defaults.font,
      };
  } catch {
    /* Invalid storage uses the readable defaults. */
  }
  return defaults;
}

export function ReaderExperience({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribePreferences, storedPreferences, () => null);
  const [override, setOverride] = useState<ReaderPreferences | null>(null);
  const preferences = useMemo(() => override ?? parsePreferences(stored), [override, stored]);
  const [summaryAction, setSummaryAction] = useState<SummaryAction>(null);
  const [progress, setProgress] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const element = root.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const distance = element.offsetHeight - window.innerHeight;
      setProgress(
        distance <= 0 ? 100 : Math.max(0, Math.min(100, ((window.scrollY - top) / distance) * 100))
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (root.current) observer?.observe(root.current);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  function updatePreferences(patch: Partial<ReaderPreferences>) {
    const next = { ...preferences, ...patch };
    setOverride(next);
    try {
      localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(next));
    } catch {
      /* Keep the current setting in memory. */
    }
  }

  const style = {
    "--reader-font-size": { small: "1.0625rem", medium: "1.1875rem", large: "1.375rem" }[
      preferences.size
    ],
    "--reader-line-width": { narrow: "54ch", comfortable: "68ch", wide: "78ch" }[preferences.width],
    "--reader-font-family":
      preferences.font === "serif"
        ? "var(--font-newsreader), Georgia, serif"
        : "var(--font-geist-sans), Arial, sans-serif",
  } as CSSProperties;

  return (
    <ReaderContext.Provider
      value={{ preferences, updatePreferences, summaryAction, setSummaryAction }}
    >
      <div ref={root} className="distil-reader-page pb-24" style={style}>
        <div
          className="distil-reader-progress"
          role="progressbar"
          aria-label="Reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        {children}
      </div>
    </ReaderContext.Provider>
  );
}

export function ReaderDisplaySettings() {
  const reader = useReaderExperience();
  const [open, setOpen] = useState(false);
  useShortcutsSuspended(open);
  if (!reader) return null;
  const { preferences, updatePreferences } = reader;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="ml-auto h-11 min-w-11 font-serif text-lg"
          aria-label="Reading display settings"
        >
          Aa
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-5">
        <h2 className="text-sm font-semibold">Reading display</h2>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Text size</p>
          <SegmentedControl
            aria-label="Text size"
            value={preferences.size}
            onValueChange={(size) => updatePreferences({ size })}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Line width</p>
          <SegmentedControl
            aria-label="Line width"
            value={preferences.width}
            onValueChange={(width) => updatePreferences({ width })}
            options={[
              { value: "narrow", label: "Narrow" },
              { value: "comfortable", label: "Normal" },
              { value: "wide", label: "Wide" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Typeface</p>
          <SegmentedControl
            aria-label="Typeface"
            value={preferences.font}
            onValueChange={(font) => updatePreferences({ font })}
            options={[
              { value: "serif", label: "Serif" },
              { value: "sans", label: "Sans" },
            ]}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
