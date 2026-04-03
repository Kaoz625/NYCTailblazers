"use client";

import { Suspense, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { OfficeFloor, Desk } from "./OfficeFloor";
import { AgentAvatar } from "./AgentAvatar";
import { useAgentStore, selectAgentList } from "@/store/agents";
import { getGatewayClient } from "@/lib/gateway-client";
import type { Agent } from "@/lib/types";

// Desk positions matching the deskIndex in agent profiles
const DESK_POSITIONS: [number, number, number][] = [
  [-4, 0, -2],
  [-1.5, 0, -2],
  [1.5, 0, -2],
  [4, 0, -2],
  [-4, 0, 1.5],
  [-1.5, 0, 1.5],
  [1.5, 0, 1.5],
  [4, 0, 1.5],
];

interface OfficeSceneProps {
  onAgentClick?: (agent: Agent) => void;
}

export function OfficeScene({ onAgentClick }: OfficeSceneProps) {
  const agents = useAgentStore(useShallow(selectAgentList));
  const { setConnected, handleGatewayMessage } = useAgentStore(
    useShallow((s) => ({ setConnected: s.setConnected, handleGatewayMessage: s.handleGatewayMessage }))
  );

  // Connect to gateway
  useEffect(() => {
    const client = getGatewayClient();

    const unsubMsg = client.onMessage(handleGatewayMessage);
    const unsubStatus = client.onStatus(setConnected);

    client.connect();

    return () => {
      unsubMsg();
      unsubStatus();
    };
  }, [handleGatewayMessage, setConnected]);

  const handleClick = useCallback(
    (agent: Agent) => onAgentClick?.(agent),
    [onAgentClick]
  );

  return (
    <Canvas
      shadows
      camera={{ position: [0, 4, 10], fov: 55 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: "#0d0d1a" }}
    >
      <Suspense fallback={null}>
        {/* Lighting */}
        <ambientLight intensity={0.3} color="#1a1a3e" />
        <directionalLight
          castShadow
          position={[5, 8, 5]}
          intensity={0.8}
          color="#ffffff"
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-5, 4, -3]} intensity={0.6} color="#e040fb" />
        <pointLight position={[5, 4, -3]} intensity={0.6} color="#40c4ff" />

        {/* Background stars */}
        <Stars radius={50} depth={30} count={1000} factor={2} fade />

        {/* Office geometry */}
        <OfficeFloor />

        {/* Desks — one per slot */}
        {DESK_POSITIONS.map((pos, i) => (
          <Desk key={i} position={pos} />
        ))}

        {/* Agent avatars */}
        {agents.map((agent) => (
          <AgentAvatar
            key={agent.id}
            agent={agent}
            onClick={() => handleClick(agent)}
          />
        ))}

        {/* Camera controls */}
        <OrbitControls
          makeDefault
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={4}
          maxDistance={20}
          target={[0, 0.5, -1]}
          enablePan
        />

        <Environment preset="night" />
      </Suspense>
    </Canvas>
  );
}
