import React from "react";

interface PayPalIconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const PayPalIcon: React.FC<PayPalIconProps> = ({
  size = 24,
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path
      d="M7.076 21.337H4.5a.641.641 0 0 1-.633-.74L6.944.901C7.026.382 7.474 0 7.998 0h5.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"
      fill="#003087"
    />
  </svg>
);
