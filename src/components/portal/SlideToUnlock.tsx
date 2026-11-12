// Swipe-to-reveal interaction used to "open" an unlocked rewards benefit.
// Adapted to project design tokens (no hardcoded colors), Spanish-first copy,
// uses motion/react (already a project dep). On a successful slide it calls
// onUnlock() once and then renders the unlocked content.
import { useState, useRef, useEffect, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideToUnlockProps {
  children?: ReactNode;
  onUnlock: () => void;
  sliderText?: string;
  unlockedContent: ReactNode;
  className?: string;
}

export const SlideToUnlock = ({
  children,
  onUnlock,
  sliderText = "Desliza para abrir tu regalo",
  unlockedContent,
  className,
}: SlideToUnlockProps) => {
  const [unlocked, setUnlocked] = useState(false);
  const [dragConstraint, setDragConstraint] = useState(0);
  const x = useMotionValue(0);

  const sliderRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      const sw = sliderRef.current?.offsetWidth || 0;
      const hw = handleRef.current?.offsetWidth || 0;
      setDragConstraint(Math.max(0, sw - hw));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onDragEnd = (_e: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > dragConstraint * 0.8) {
      setUnlocked(true);
      onUnlock();
    } else {
      x.set(0);
    }
  };

  const textOpacity = useTransform(x, [0, 60], [1, 0]);
  const fillWidth = useTransform(x, (v) => `${v + 56}px`);

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {children}
      <AnimatePresence mode="wait" initial={false}>
        {!unlocked ? (
          <motion.div
            key="slider"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div
              ref={sliderRef}
              className="relative h-12 w-full rounded-full overflow-hidden select-none"
              style={{ background: "var(--bg-elevated)" }}
            >
              {/* Fill that grows with the handle */}
              <motion.div
                className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
                style={{ width: fillWidth, background: "var(--accent-dim)" }}
              />
              <motion.div
                ref={handleRef}
                drag="x"
                dragConstraints={{ left: 0, right: dragConstraint }}
                dragElastic={0.05}
                dragMomentum={false}
                style={{ x }}
                onDragEnd={onDragEnd}
                className="absolute left-0 top-0 z-10 flex h-12 w-12 cursor-grab items-center justify-center rounded-full active:cursor-grabbing shadow-md"
                whileTap={{ scale: 0.95 }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "var(--accent-color)" }}
                >
                  <ChevronRight size={20} className="icon-extrabold" style={{ color: "var(--bg-base)" }} />
                </div>
              </motion.div>
              <motion.span
                style={{ opacity: textOpacity, color: "var(--text-secondary)" }}
                className="absolute inset-0 flex items-center justify-center text-[12px] font-bold uppercase tracking-wider pointer-events-none"
              >
                {sliderText}
              </motion.span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="unlocked"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            {unlockedContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SlideToUnlock;
