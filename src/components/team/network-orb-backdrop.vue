<!--
  NetworkOrbBackdrop — ported from Nexion-prototype/app/components/team/
  network-orb-backdrop.tsx. Decorative orbit visualization (2 orbits, lemon
  direct + cyan extended dots) used as a card background. Non-interactive.
  SMIL <animateTransform>/<animate> confirmed working on uni H5 + App webview
  (PITFALLS P-013). Dot positions precomputed in script (no useMemo needed).
-->
<template>
  <svg
    aria-hidden="true"
    :viewBox="`0 0 ${VIEW} ${VIEW}`"
    preserveAspectRatio="xMidYMid meet"
    :style="rootStyle"
  >
    <defs>
      <radialGradient id="orbCenterGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="var(--v5-brand)" stop-opacity="0.32" />
        <stop offset="60%" stop-color="var(--v5-brand)" stop-opacity="0.08" />
        <stop offset="100%" stop-color="var(--v5-brand)" stop-opacity="0" />
      </radialGradient>
    </defs>

    <circle :cx="CENTER" :cy="CENTER" :r="DIRECT_RADIUS" fill="none" stroke="var(--v5-brand)" stroke-opacity="0.22" stroke-width="0.8" />

    <!-- Extended orbit + outer dots rotate slowly clockwise -->
    <g>
      <animateTransform attributeName="transform" type="rotate"
        :from="`0 ${CENTER} ${CENTER}`" :to="`360 ${CENTER} ${CENTER}`"
        dur="42s" repeatCount="indefinite" />
      <circle :cx="CENTER" :cy="CENTER" :r="EXTENDED_RADIUS" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-opacity="0.18" stroke-width="0.8" stroke-dasharray="2 6" />
      <circle v-for="(d, i) in extendedDots" :key="`outer-${i}`" :cx="d.x" :cy="d.y" :r="d.r" fill="var(--v5-tech-cyan)" fill-opacity="0.85" />
    </g>

    <!-- Inner orbit counter-rotates for depth -->
    <g>
      <animateTransform attributeName="transform" type="rotate"
        :from="`360 ${CENTER} ${CENTER}`" :to="`0 ${CENTER} ${CENTER}`"
        dur="28s" repeatCount="indefinite" />
      <line v-for="(d, i) in directDots" :key="`conn-${i}`" :x1="CENTER" :y1="CENTER" :x2="d.x" :y2="d.y" stroke="var(--v5-brand)" stroke-opacity="0.18" stroke-width="0.6" />
      <circle v-for="(d, i) in directDots" :key="`inner-${i}`" :cx="d.x" :cy="d.y" :r="d.r" fill="var(--v5-brand)" fill-opacity="0.9">
        <animate v-if="i === 0 || i === 3" attributeName="r"
          :values="`${d.r};${d.r + 2.5};${d.r}`"
          :dur="i === 0 ? '2.2s' : '2.6s'" :begin="i === 0 ? '0s' : '0.6s'" repeatCount="indefinite" />
      </circle>
    </g>

    <!-- Center glow — breathing -->
    <circle :cx="CENTER" :cy="CENTER" r="50" fill="url(#orbCenterGlow)">
      <animate attributeName="r" values="46;54;46" dur="4.4s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.75;1;0.75" dur="4.4s" repeatCount="indefinite" />
    </circle>
  </svg>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(defineProps<{ opacity?: number }>(), { opacity: 0.35 });

const VIEW = 360;
const CENTER = VIEW / 2;
const DIRECT_RADIUS = 58;
const EXTENDED_RADIUS = 132;

interface Dot {
  x: number;
  y: number;
  r: number;
}

function polar(cx: number, cy: number, r: number, angleRad: number): [number, number] {
  const round = (n: number) => Math.round(n * 100) / 100;
  return [round(cx + r * Math.cos(angleRad)), round(cy + r * Math.sin(angleRad))];
}

const directDots: Dot[] = (() => {
  const out: Dot[] = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const [x, y] = polar(CENTER, CENTER, DIRECT_RADIUS, a);
    out.push({ x, y, r: 4 });
  }
  return out;
})();

const extendedDots: Dot[] = (() => {
  const out: Dot[] = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.18;
    const rJitter = EXTENDED_RADIUS + ((i * 13) % 22) - 11;
    const [x, y] = polar(CENTER, CENTER, rJitter, a);
    out.push({ x, y, r: 2.8 });
  }
  return out;
})();

const rootStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  right: "-40px",
  top: "50%",
  transform: "translateY(-50%)",
  width: "220px",
  height: "220px",
  opacity: props.opacity,
  pointerEvents: "none",
}));
</script>
