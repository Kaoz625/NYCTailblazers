"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { HUD } from "@/components/HUD";
import { AgentPanel } from "@/components/AgentPanel";
import type { Agent } from "@/lib/types";

// Dynamically import the 3D scene — Three.js is client-only
const OfficeScene = dynamic(
  () => import("@/components/OfficeScene").then((m) => m.OfficeScene),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0d0d1a]" /> }
);

export default function OfficePage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const handleAgentClick = useCallback((agent: Agent) => {
    setSelectedAgent((prev) => (prev?.id === agent.id ? null : agent));
  }, []);

  const handleClose = useCallback(() => setSelectedAgent(null), []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 3D canvas fills the viewport */}
      <div className="absolute inset-0">
        <OfficeScene onAgentClick={handleAgentClick} />
      </div>

      {/* HUD overlay */}
      <HUD onAgentSelect={handleAgentClick} selectedAgentId={selectedAgent?.id} />

      {/* Agent detail panel — anchored bottom-right */}
      {selectedAgent && (
        <div className="absolute bottom-20 right-3 z-30">
          <AgentPanel agent={selectedAgent} onClose={handleClose} />
        </div>
      )}
    </div>
  );
}
