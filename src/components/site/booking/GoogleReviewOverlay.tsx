// Optional post-booking Google review invitation. Shown only after a
// committed + paid booking and after the customer leaves the confirmation
// card. Same Google link for everyone; no rating is collected or used to filter.
import { useEffect } from "react";
import { motion } from "motion/react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  isEs: boolean;
  onReview: () => void;
  onLater: () => void;
  onClose: () => void;
}

export default function GoogleReviewOverlay({ isEs, onReview, onLater, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
      >
        <div className="pointer-events-auto relative w-full max-w-[340px] rounded-[28px] bg-card text-card-foreground border border-border shadow-2xl px-6 pt-8 pb-6">
          <button
            type="button"
            onClick={onClose}
            aria-label={isEs ? "Cerrar" : "Close"}
            className="absolute top-3 right-3 h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>

          <Button
            type="button"
            variant="ghost"
            onClick={onReview}
            aria-label={isEs ? "Dejar reseña en Google usando las estrellas" : "Leave a Google review using the stars"}
            title={isEs ? "Dejar reseña en Google" : "Leave a Google review"}
            className="flex mx-auto h-11 w-fit justify-center gap-1.5 mb-4 px-2 text-muted-foreground [&_svg]:size-[26px]"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: [0, 1, 0.55], y: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.9 }}
              >
                <Star size={26} aria-hidden="true" className="text-muted-foreground" />
              </motion.span>
            ))}
          </Button>

          <h2 id="review-title" className="text-[20px] font-black text-center tracking-tight">
            {isEs ? "¿Cómo fue tu experiencia reservando?" : "How was your booking experience?"}
          </h2>
          <p className="text-[13px] text-center text-muted-foreground mt-2">
            {isEs
              ? "Tu opinión en Google ayuda a otros clientes a conocernos."
              : "Your Google review helps other clients find us."}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onReview}
              className="h-12 rounded-full bg-primary text-primary-foreground font-semibold text-[15px]"
            >
              {isEs ? "Dejar reseña en Google" : "Leave a Google review"}
            </button>
            <button
              type="button"
              onClick={onLater}
              className="h-12 rounded-full text-muted-foreground font-medium text-[14px]"
            >
              {isEs ? "Quizás luego" : "Maybe later"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
