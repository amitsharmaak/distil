import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

export function renderWithContentCache(ui: ReactElement, options?: RenderOptions) {
  const Inner = options?.wrapper;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ContentCacheProvider accountKey="test-account">
        {Inner ? <Inner>{children}</Inner> : children}
      </ContentCacheProvider>
    );
  }
  return rtlRender(ui, { ...options, wrapper: Wrapper });
}
