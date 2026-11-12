import React from "react";

interface CashIconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const CashIcon: React.FC<CashIconProps> = ({
  size = 24,
  className,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="1" y="5" width="22" height="14" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M1 9h2M21 9h2M1 15h2M21 15h2" />
  </svg>
);
