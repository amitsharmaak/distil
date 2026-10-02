import { act } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

export const SERVER_CLOCK = "12:45 PM";
export const CLIENT_CLOCK = "6:15 PM";

export interface HydrationResult {
  /** The HTML the server sent. */
  serverHtml: string;
  /** Errors React recovered from by discarding server HTML, e.g. a text mismatch. */
  recoverableErrors: string[];
  container: HTMLElement;
  unmount: () => void;
}

/**
 * Server-render `ui`, then hydrate it the way a browser in another timezone would.
 *
 * Production renders in UTC and hydrates in the reader's timezone, so any clock time formatted
 * during render differs between the two. Jest runs both in one process and one timezone, so the
 * difference is made explicit: `toLocaleTimeString` answers `SERVER_CLOCK` while rendering on
 * the server and `CLIENT_CLOCK` in the browser. A component that formats a time during its
 * first render then fails hydration here exactly as it does in production.
 */
export async function serverRenderThenHydrate(ui: ReactElement): Promise<HydrationResult> {
  const clock = jest.spyOn(Date.prototype, "toLocaleTimeString");
  clock.mockReturnValue(SERVER_CLOCK);
  const serverHtml = renderToString(ui);

  clock.mockReturnValue(CLIENT_CLOCK);
  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  const recoverableErrors: string[] = [];
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, ui, {
      onRecoverableError: (error) => {
        recoverableErrors.push(error instanceof Error ? error.message : String(error));
      },
    });
  });
  return {
    serverHtml,
    recoverableErrors,
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      clock.mockRestore();
    },
  };
}
