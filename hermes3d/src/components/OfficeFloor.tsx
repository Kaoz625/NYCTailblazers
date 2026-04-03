"use client";

import { useRef } from "react";
import { MeshStandardMaterial } from "three";

/** Checkerboard floor + back wall for the retro office */
export function OfficeFloor() {
  const wallRef = useRef<MeshStandardMaterial>(null);

  return (
    <group>
      {/* Checkerboard floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.5, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#16213e" />
      </mesh>

      {/* Floor grid lines */}
      <gridHelper args={[20, 20, "#0f3460", "#0f3460"]} position={[0, -0.499, 0]} />

      {/* Back wall */}
      <mesh position={[0, 2.5, -5]} receiveShadow>
        <planeGeometry args={[20, 6]} />
        <meshStandardMaterial ref={wallRef} color="#1a1a2e" />
      </mesh>

      {/* Left wall */}
      <mesh position={[-10, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[20, 6]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Right wall */}
      <mesh position={[10, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[20, 6]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5.5, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      {/* Neon floor accent strip — front */}
      <mesh position={[0, -0.48, 4.5]}>
        <boxGeometry args={[18, 0.05, 0.1]} />
        <meshStandardMaterial color="#e040fb" emissive="#e040fb" emissiveIntensity={2} />
      </mesh>

      {/* Neon floor accent strip — back */}
      <mesh position={[0, -0.48, -4.5]}>
        <boxGeometry args={[18, 0.05, 0.1]} />
        <meshStandardMaterial color="#40c4ff" emissive="#40c4ff" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

/** A single desk + monitor prop */
export function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Desk surface */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.06, 0.8]} />
        <meshStandardMaterial color="#0f3460" />
      </mesh>
      {/* Desk legs */}
      {(
        [
          [-0.6, 0, -0.3],
          [0.6, 0, -0.3],
          [-0.6, 0, 0.3],
          [0.6, 0, 0.3],
        ] as [number, number, number][]
      ).map((pos, i) => (
        <mesh key={i} position={[pos[0], pos[1] + 0.17, pos[2]]} castShadow>
          <boxGeometry args={[0.05, 0.35, 0.05]} />
          <meshStandardMaterial color="#0a2744" />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 0.75, -0.25]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.04]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {/* Monitor screen glow */}
      <mesh position={[0, 0.75, -0.23]}>
        <boxGeometry args={[0.72, 0.44, 0.01]} />
        <meshStandardMaterial color="#0f3460" emissive="#0f3460" emissiveIntensity={1.5} />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.52, -0.25]} castShadow>
        <boxGeometry args={[0.08, 0.06, 0.08]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  );
}
