import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { RecruitmentForm } from "@/components/site/RecruitmentForm";

export default function JoinTeam() {
  const { language } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <SEOHead title="Únete al Equipo — Charlie's Barbershop" description="Oportunidades de empleo para barberos en Camuy, PR." path="/unete" />
      <h1
        className="font-black uppercase leading-[0.95] mb-3"
        style={{ fontSize: "clamp(32px, 6vw, 56px)", letterSpacing: "-1.5px", color: "var(--text-primary)" }}
      >
        {language === "es" ? "Únete al Equipo" : "Join the Team"}
      </h1>
      <p className="text-base leading-relaxed mb-10 max-w-xl" style={{ color: "var(--text-secondary)" }}>
        {language === "es"
          ? "En Charlie's Barbershop buscamos barberos con pasión, disciplina y actitud de crecer. Si quieres ser parte de la barbería mejor calificada en Camuy, llena el formulario."
          : "At Charlie's Barbershop we're looking for barbers with passion, discipline, and a growth mindset. If you want to be part of the highest rated barbershop in Camuy, fill out the form."}
      </p>

      <div className="rounded-2xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <RecruitmentForm />
      </div>
    </div>
  );
}
