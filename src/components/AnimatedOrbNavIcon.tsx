import { useId } from "react";
const orbTextureLight = "/assets/filho-orb-texture.webp";
const orbTextureDark = "/assets/filho-orb-texture-dark.webp";

// Preload textures at module import so the orb never paints its bare shell
// first on a cold load (no "old version → new version" pop-in).
if (typeof window !== "undefined") {
  [orbTextureLight, orbTextureDark].forEach((src) => {
    const img = new Image();
    img.decoding = "sync";
    img.src = src;
  });
}

/**
 * AnimatedOrbNavIcon — Filho's bottom-nav crystal orb.
 *
 * Real fractal smoke texture rotates and breathes inside a masked
 * circle, layered under glass highlights and a rim light so it reads
 * as a physical, embedded sphere — like ChatGPT Voice / ElevenLabs
 * agent orbs. Two texture variants: warm cream (light mode) and
 * smoky obsidian (dark mode), swapped via Tailwind `dark:` classes.
 *
 * Pure CSS animation, no deps. Respects prefers-reduced-motion.
 */
interface AnimatedOrbNavIconProps {
  size?: number;
  className?: string;
}

export function AnimatedOrbNavIcon({ size = 32, className = "" }: AnimatedOrbNavIconProps) {
  const uid = useId().replace(/:/g, "");
  const k = (n: string) => `orb-${uid}-${n}`;

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        position: "relative",
        flexShrink: 0,
        filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35)) drop-shadow(0 0.5px 0.5px rgba(0,0,0,0.1))",
      }}
      aria-hidden
    >
      <style>{`
        @keyframes ${k("spinA")} {
          0%   { transform: rotate(0deg)   scale(1.35); }
          100% { transform: rotate(360deg) scale(1.35); }
        }
        @keyframes ${k("spinB")} {
          0%   { transform: rotate(360deg) scale(1.5)  translate(2%, -1%); }
          100% { transform: rotate(0deg)   scale(1.5)  translate(2%, -1%); }
        }
        @keyframes ${k("breathe")} {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 0.9;  transform: scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          .${k("anim")} { animation: none !important; }
        }
      `}</style>

      {/* Light-mode shell — warm cream */}
      <span
        className="hidden"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "9999px",
          overflow: "hidden",
          background: "#e8d6bc",
          boxShadow: [
            "inset 0 0 0 0.5px rgba(255,255,255,0.55)",
            "inset 0 -2px 3px rgba(60,40,20,0.32)",
            "inset 0 1.5px 1.5px rgba(255,255,255,0.5)",
          ].join(", "),
        }}
      >
        <span
          className={k("anim")}
          style={{
            position: "absolute",
            inset: "-20%",
            backgroundImage: `url(${orbTextureLight})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            animation: `${k("spinA")} 24s linear infinite`,
            transformOrigin: "center",
          }}
        />
        <span
          className={k("anim")}
          style={{
            position: "absolute",
            inset: "-25%",
            backgroundImage: `url(${orbTextureLight})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "overlay",
            opacity: 0.85,
            animation: `${k("spinB")} 38s linear infinite`,
            transformOrigin: "center",
          }}
        />
        <span
          className={k("anim")}
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 45% 42%, rgba(255, 245, 220, 0.45) 0%, transparent 55%)",
            animation: `${k("breathe")} 6s ease-in-out infinite`,
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 52% 40% at 68% 22%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.28) 38%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: "15%",
            right: "23%",
            width: "16%",
            height: "13%",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.98) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 50% at 50% 95%, rgba(60, 40, 20, 0.35) 0%, transparent 60%)",
            pointerEvents: "none",
            mixBlendMode: "multiply",
          }}
        />
      </span>

      {/* Dark-mode shell — smoky obsidian */}
      <span
        className="block"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "9999px",
          overflow: "hidden",
          background: "#1a1a1c",
          boxShadow: [
            "inset 0 0 0 0.5px rgba(255,255,255,0.18)",
            "inset 0 -2px 3px rgba(0,0,0,0.6)",
            "inset 0 1.5px 1.5px rgba(255,255,255,0.18)",
          ].join(", "),
        }}
      >
        <span
          className={k("anim")}
          style={{
            position: "absolute",
            inset: "-20%",
            backgroundImage: `url(${orbTextureDark})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            animation: `${k("spinA")} 24s linear infinite`,
            transformOrigin: "center",
          }}
        />
        <span
          className={k("anim")}
          style={{
            position: "absolute",
            inset: "-25%",
            backgroundImage: `url(${orbTextureDark})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "overlay",
            opacity: 0.85,
            animation: `${k("spinB")} 38s linear infinite`,
            transformOrigin: "center",
          }}
        />
        <span
          className={k("anim")}
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 45% 42%, rgba(244, 223, 194, 0.22) 0%, transparent 55%)",
            animation: `${k("breathe")} 6s ease-in-out infinite`,
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 52% 40% at 68% 22%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 38%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: "15%",
            right: "23%",
            width: "16%",
            height: "13%",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 50% at 50% 95%, rgba(0, 0, 0, 0.55) 0%, transparent 60%)",
            pointerEvents: "none",
            mixBlendMode: "multiply",
          }}
        />
      </span>
    </span>
  );
}
