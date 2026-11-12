import React from "react";

/**
 * Compact card-brand badges used inline in pay buttons.
 * Style matches the rounded "VISA" chip used in the Acuity checkout reference:
 * a small rounded white tile with the brand wordmark/logo inside.
 *
 * Render at h≈18 next to button text. Always white tile so it stays legible
 * regardless of the button background (works on accent / black / white).
 */

interface Props {
  brand: string | null | undefined;
  className?: string;
  height?: number;
}

const Tile: React.FC<{ children: React.ReactNode; height: number; width: number }> = ({
  children,
  height,
  width,
}) => (
  <span
    aria-hidden
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height,
      width,
      background: "#ffffff",
      borderRadius: 4,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
      overflow: "hidden",
      flexShrink: 0,
    }}
  >
    {children}
  </span>
);

export const CardBrandIcon: React.FC<Props> = ({ brand, className, height = 18 }) => {
  const b = (brand || "").toLowerCase();
  const w = Math.round(height * 1.6); // ~29 at h=18

  if (b === "visa") {
    return (
      <span className={className}>
        <Tile height={height} width={w}>
          <svg viewBox="0 0 48 16" height={height - 4} width={w - 6} xmlns="http://www.w3.org/2000/svg">
            <text
              x="24"
              y="13"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontWeight="900"
              fontSize="14"
              fontStyle="italic"
              fill="#1A1F71"
              letterSpacing="0.5"
            >
              VISA
            </text>
          </svg>
        </Tile>
      </span>
    );
  }

  if (b === "mastercard" || b === "master-card" || b === "mc") {
    // Iconic two-circle Mastercard mark (red + yellow with orange overlap)
    return (
      <span className={className}>
        <Tile height={height} width={w}>
          <svg viewBox="0 0 32 20" height={height - 2} xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="10" r="7" fill="#EB001B" />
            <circle cx="20" cy="10" r="7" fill="#F79E1B" />
            <path d="M16 5.2a7 7 0 0 0 0 9.6 7 7 0 0 0 0-9.6z" fill="#FF5F00" />
          </svg>
        </Tile>
      </span>
    );
  }

  if (b === "apple_pay" || b === "apple-pay" || b === "applepay" || b === "apple") {
    // Apple silhouette (matches PaymentMethodSheet AppleGlyph), rendered black on white tile
    return (
      <span className={className}>
        <Tile height={height} width={w}>
          <svg
            width={height - 4}
            height={height - 4}
            viewBox="0 0 16 16"
            fill="#000000"
            aria-hidden="true"
          >
            <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z" />
          </svg>
        </Tile>
      </span>
    );
  }

  if (b === "paypal") {
    // PayPal "PP" lockup (matches PaymentMethodSheet PayPalGlyph), rendered in PayPal blue on white tile
    const maskId = `cb-paypal-mask-${height}`;
    return (
      <span className={className}>
        <Tile height={height} width={w}>
          <svg
            width={height - 4}
            height={height - 4}
            viewBox="0 0 24 24"
            fill="#003087"
            fillRule="evenodd"
            clipRule="evenodd"
            aria-hidden="true"
          >
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <rect x="0" y="0" width="24" height="24" fill="#fff" />
                <path fill="#000" d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.024.143-.052.286-.084.437-1.103 5.65-4.872 7.598-9.708 7.598h-2.46a1.187 1.187 0 0 0-1.174 1.002l-1.292 8.2z" />
              </mask>
            </defs>
            <path mask={`url(#${maskId})`} d="M19.95 7.554c-1.115 5.74-5.467 6.526-9.31 6.526h-1.95l-1.36 8.624a.503.503 0 0 0 .497.583h4.014a.83.83 0 0 0 .82-.7l.034-.179.776-4.92.05-.27a.83.83 0 0 1 .82-.7h.516c3.34 0 5.956-1.358 6.72-5.282.319-1.64.154-3.01-.69-3.973a3.293 3.293 0 0 0-.937-.71z" />
            <path opacity="0.45" d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.024.143-.052.286-.084.437-1.103 5.65-4.872 7.598-9.708 7.598h-2.46a1.187 1.187 0 0 0-1.174 1.002l-1.292 8.2z" />
          </svg>
        </Tile>
      </span>
    );
  }

  if (b === "amex" || b === "american_express" || b === "american express") {
    return (
      <span className={className}>
        <Tile height={height} width={w}>
          <svg viewBox="0 0 48 16" height={height - 4} width={w - 6} xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="16" fill="#2E77BC" />
            <text
              x="24"
              y="11"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontWeight="900"
              fontSize="7"
              fill="#ffffff"
              letterSpacing="0.5"
            >
              AMEX
            </text>
          </svg>
        </Tile>
      </span>
    );
  }

  if (b === "discover") {
    return (
      <span className={className}>
        <Tile height={height} width={w}>
          <svg viewBox="0 0 48 16" height={height - 4} width={w - 6} xmlns="http://www.w3.org/2000/svg">
            <text
              x="22"
              y="12"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontWeight="900"
              fontSize="8"
              fill="#000000"
            >
              DISCOVER
            </text>
            <circle cx="42" cy="8" r="4" fill="#FF6000" />
          </svg>
        </Tile>
      </span>
    );
  }

  // Generic fallback: just show brand name in a tile
  return (
    <span className={className}>
      <Tile height={height} width={w}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: "#111",
            fontFamily: "Montserrat, sans-serif",
            textTransform: "uppercase",
          }}
        >
          {brand || "Card"}
        </span>
      </Tile>
    </span>
  );
};
