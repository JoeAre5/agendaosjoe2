// Reusable animated check icon — extracted from the admin cancellation popup
// (src/pages/AppointmentDetail.tsx). Spring-based scale + rotate using motion.
import { motion } from "motion/react";
import { CheckCircle } from "lucide-react";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export default function AnimatedCheckmark({
  size = 56,
  color = "#22c55e",
  strokeWidth = 2.5,
  className,
}: Props) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: [0, 1.2, 1], rotate: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 15, duration: 0.6 }}
      className={className}
    >
      <CheckCircle size={size} color={color} strokeWidth={strokeWidth} />
    </motion.div>
  );
}
