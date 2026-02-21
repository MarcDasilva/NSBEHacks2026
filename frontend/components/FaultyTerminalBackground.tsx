"use client";

import FaultyTerminal from "./FaultyTerminal";

// Stable refs so parent re-renders (e.g. PostLoginPhaseContext phase updates) don't
// retrigger FaultyTerminal's useEffect and cause WebGL re-init / page-load animation replay.
const GRID_MUL: [number, number] = [2, 1];
const CONTAINER_STYLE = {
  position: "fixed" as const,
  inset: 0,
  width: "100%",
  height: "100%",
  zIndex: 0,
  backgroundColor: "#0d0d0d",
};
const TERMINAL_STYLE = { width: "100%", height: "100%" };

export default function FaultyTerminalBackground() {
  return (
    <div style={CONTAINER_STYLE}>
      <FaultyTerminal
        scale={1.5}
        gridMul={GRID_MUL}
        digitSize={1.9}
        timeScale={0.5}
        pause={false}
        scanlineIntensity={0.5}
        glitchAmount={1}
        flickerAmount={1}
        noiseAmp={0.7}
        chromaticAberration={0}
        dither={0}
        curvature={0.1}
        tint="#919290"
        mouseReact={false}
        mouseStrength={0.5}
        pageLoadAnimation
        brightness={0.9}
        className=""
        style={TERMINAL_STYLE}
      />
    </div>
  );
}
