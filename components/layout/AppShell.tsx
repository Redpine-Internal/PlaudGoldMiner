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
    <div className="pgm-shell">
      {isMobile ? null : <Sidebar />}
      <div className="pgm-workspace">
        <Toolbar />
        <div className="pgm-workspace-row">
          <main className={`pgm-main${pathname.startsWith("/clone") ? " pgm-main--clone" : ""}`} data-screen-label={pathname}>
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
