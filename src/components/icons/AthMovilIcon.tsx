import React from "react";

interface AthMovilIconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const AthMovilIcon: React.FC<AthMovilIconProps> = ({
  size = 24,
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="none"
    className={className}
  >
    {/* Top-right arrow (white) */}
    <path
      d="M17 1h-6v3h3.59L7.29 11.29l2.12 2.12L17 5.83V9h3V1z"
      fill="white"
    />
    {/* Bottom-left arrow (gray) */}
    <path
      d="M7 23h6v-3H9.41l7.3-7.29-2.12-2.12L7 18.17V15H4v8z"
      fill="#999999"
    />
  </svg>
);
