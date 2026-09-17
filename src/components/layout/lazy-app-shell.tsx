"use client";

import dynamic from "next/dynamic";

export const AppShell = dynamic(() =>
  import("@/components/layout/app-shell").then((module) => module.AppShell)
);
