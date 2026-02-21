"use client";

import FaultyTerminal from "./FaultyTerminal";

export default function FaultyTerminalBackground() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        backgroundColor: "#0d0d0d",
      }}
    >
      <FaultyTerminal
        scale={1.5}
        gridMul={[2, 1]}
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
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
