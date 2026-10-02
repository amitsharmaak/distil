"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** Reserves about the width of a formatted time, so the header does not shift when it fills. */
const PLACEHOLDER = "00:00 am";

function localTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * "Updated 6:15 PM" for a cache read time, in the reader's own timezone and locale.
 *
 * A clock time cannot be formatted during server rendering: the server's timezone and locale
 * are not the reader's, so the text would differ on hydration, React would discard the
 * server-rendered tree, and with it everything set on `<html>` before hydration. The server
 * and the first client render therefore emit the same placeholder of reserved width; the local
 * time replaces it right after hydration. Client-side navigations render the time at once.
 */
export function UpdatedTime({
  at,
  label = "Updated",
  className,
}: {
  /** `dataUpdatedAt` in epoch milliseconds; `0` means nothing has been read yet. */
  at: number;
  label?: string;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  if (!at) return <span className={className}>Not updated yet</span>;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {label}{" "}
      {hydrated ? (
        <time dateTime={new Date(at).toISOString()}>{localTime(at)}</time>
      ) : (
        <span className="invisible" aria-hidden="true">
          {PLACEHOLDER}
        </span>
      )}
    </span>
  );
}
