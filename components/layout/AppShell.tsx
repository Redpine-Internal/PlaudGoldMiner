"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import OutputPanel from "./OutputPanel";
import { useAppStore } from "@/stores/appStore";
import { EnrichmentProvider } from "@/components/ds";

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const selectedConversationId = useAppStore((s) => s.selectedConversationId);
  const showPanel = pathname.startsWith("/conversas") && !!selectedConversationId;

  // A tela de login não usa a shell (sem sidebar/painel).
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--background)", color: "var(--textPrimary)", overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 24px 24px 14px" }} data-screen-label={pathname}>
          <EnrichmentProvider>{children}</EnrichmentProvider>
        </main>
        {showPanel ? <OutputPanel /> : null}
      </div>
    </div>
  );
};

export default AppShell;
