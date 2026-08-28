"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";
import MobileTabBar from "./MobileTabBar";
import OutputPanel from "./OutputPanel";
import { useAppStore } from "@/stores/appStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { EnrichmentProvider } from "@/components/ds";

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const selectedConversationId = useAppStore((s) => s.selectedConversationId);
  const showPanel = !isMobile && pathname.startsWith("/conversas") && !!selectedConversationId;

  // A tela de login não usa a shell (sem sidebar/toolbar/painel).
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--color-background)",
        color: "var(--color-foreground)",
        overflow: "hidden",
      }}
    >
      {isMobile ? null : <Sidebar />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <Toolbar />
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <main
            style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 16px 108px" : "32px", minWidth: 0 }}
            data-screen-label={pathname}
          >
            <EnrichmentProvider>{children}</EnrichmentProvider>
          </main>
          {showPanel ? <OutputPanel /> : null}
        </div>
      </div>
      {isMobile ? <MobileTabBar /> : null}
    </div>
  );
};

export default AppShell;
