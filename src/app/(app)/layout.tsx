"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/shell";
import { IncomingCallHost } from "@/components/call";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <IncomingCallHost />
    </>
  );
}
