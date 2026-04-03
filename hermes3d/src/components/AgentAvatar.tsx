"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "@/lib/types";
import { STATUS_COLORS } from "@/store/agents";

interface AgentAvatarProps {
  agent: Agent;
  onClick?: () => void;
}

/** Animated 3D avatar representing a single Hermes agent at their desk */
export function AgentAvatar({ agent, onClick }: AgentAvatarProps) {
  const bodyRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const statusColor = STATUS_COLORS[agent.status] ?? "#9e9e9e";

  // Bob / pulse animations based on status
  useFrame((_, delta) => {
    if (!bodyRef.current) return;

    if (agent.status === "working" || agent.status === "thinking") {
      // Gentle up-down bob
      bodyRef.current.position.y =
        agent.position.y + 0.8 + Math.sin(Date.now() * 0.003) * 0.08;
    } else if (agent.status === "idle") {
      bodyRef.current.position.y = agent.position.y + 0.8;
    } else if (agent.status === "done") {
      bodyRef.current.position.y = agent.position.y + 0.8;
    }

    // Spin status ring for active agents
    if (ringRef.current) {
      if (agent.status === "thinking" || agent.status === "working") {
        ringRef.current.rotation.y += delta * 2;
      }
    }

    // Pulse glow
    if (glowRef.current) {
      const intensity = agent.status === "idle" ? 0.4 : 1 + Math.sin(Date.now() * 0.005) * 0.6;
      glowRef.current.intensity = intensity;
    }
  });

  // Agent body color (slightly desaturated version of accent)
  const bodyColor = useMemo(() => {
    const c = new THREE.Color(agent.color);
    c.multiplyScalar(0.6);
    return c;
  }, [agent.color]);

  return (
    <group
      position={[agent.position.x, agent.position.y, agent.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Point light for ambient glow */}
      <pointLight
        ref={glowRef}
        color={agent.color}
        intensity={0.8}
        distance={3}
        position={[0, 1.2, 0]}
      />

      {/* Body — simple humanoid block */}
      <mesh ref={bodyRef} position={[0, 0.8, 0]} castShadow>
        {/* Torso */}
        <group>
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.3, 0.4, 0.2]} />
            <meshStandardMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.3} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.32, 0]} castShadow>
            <boxGeometry args={[0.22, 0.22, 0.22]} />
            <meshStandardMaterial color={agent.color} emissive={agent.color} emissiveIntensity={0.5} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.06, 0.34, 0.115]}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
          </mesh>
          <mesh position={[0.06, 0.34, 0.115]}>
            <boxGeometry args={[0.04, 0.04, 0.01]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
          </mesh>
          {/* Arms */}
          <mesh position={[-0.22, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.32, 0.12]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0.22, 0, 0]} castShadow>
            <boxGeometry args={[0.1, 0.32, 0.12]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          {/* Legs */}
          <mesh position={[-0.08, -0.36, 0]} castShadow>
            <boxGeometry args={[0.12, 0.28, 0.15]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
          <mesh position={[0.08, -0.36, 0]} castShadow>
            <boxGeometry args={[0.12, 0.28, 0.15]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
        </group>
      </mesh>

      {/* Status ring around feet */}
      <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.03, 8, 32]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={agent.status === "idle" ? 0.5 : 2}
        />
      </mesh>

      {/* Billboard name + status label */}
      <Billboard position={[0, 2.1, 0]}>
        <Text
          fontSize={0.18}
          color={agent.color}
          outlineWidth={0.02}
          outlineColor="#000000"
          anchorX="center"
          anchorY="middle"
        >
          {agent.name}
        </Text>
        <Text
          position={[0, -0.22, 0]}
          fontSize={0.12}
          color={statusColor}
          outlineWidth={0.015}
          outlineColor="#000000"
          anchorX="center"
          anchorY="middle"
        >
          {agent.status.toUpperCase()}
        </Text>
        {agent.task && agent.status !== "idle" && (
          <Text
            position={[0, -0.42, 0]}
            fontSize={0.09}
            color="#cccccc"
            outlineWidth={0.01}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
            maxWidth={2}
          >
            {agent.task.slice(0, 40)}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
