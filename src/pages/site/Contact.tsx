import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { ContactForm } from "@/components/site/ContactForm";
import { MapPin, Clock, Phone } from "lucide-react";

export default function Contact() {
  const { language } = useTranslation();

  const whatsappMessage = encodeURIComponent(
    language === "es"
      ? "Hola, tengo una pregunta antes de reservar una cita."
      : "Hi, I have a question before booking an appointment."
  );
  const whatsappUrl = `https://wa.me/17873481281?text=${whatsappMessage}`;

  return (
    <div className="max-w-4xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <SEOHead title="Contacto — Charlie's Barbershop" description="Visítanos en PR-2 Km 93.3, Camuy, Puerto Rico. Horario martes a sábado. Llama, escribe por WhatsApp o reserva tu cita en línea con Charlie's Barbershop." path="/contacto" />
      <h1
        className="font-black uppercase leading-[0.95] mb-3"
        style={{ fontSize: "clamp(32px, 6vw, 56px)", letterSpacing: "-1.5px", color: "var(--text-primary)" }}
      >
        {language === "es" ? "Contacto" : "Contact"}
      </h1>
      <p className="text-base mb-10" style={{ color: "var(--text-secondary)" }}>
        {language === "es"
          ? "¿Preguntas? Escríbenos o visítanos."
          : "Questions? Write to us or visit."}
      </p>

      <div className="grid md:grid-cols-2 gap-8 mb-10">
        <div className="rounded-2xl p-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <ContactForm />
        </div>

        <div className="space-y-6">
          {[
            { icon: MapPin, title: language === "es" ? "Dirección" : "Address", text: "PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627" },
            { icon: Clock, title: language === "es" ? "Horario" : "Hours", text: language === "es" ? "Martes a Sábado 9:00 AM a 5:00 PM" : "Tue-Sat 9:00 AM - 5:00 PM" },
            { icon: Phone, title: language === "es" ? "Teléfono" : "Phone", text: "+1 (787) 348-1281" },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-2)" }}>
                <Icon size={16} style={{ color: "var(--accent-color)" }} />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent-color)" }}>{title}</h3>
                <p className="text-base mt-1" style={{ color: "var(--text-secondary)" }}>{text}</p>
              </div>
            </div>
          ))}

          {/* WhatsApp */}
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-2)" }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--accent-color)">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent-color)" }}>WhatsApp</h3>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base mt-1 inline-block underline"
                style={{ color: "var(--accent-color)" }}
              >
                {language === "es"
                  ? "Escríbenos para servicio al cliente"
                  : "Write to us for customer service"}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Google Maps live embed — same key/query as Home.tsx */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid var(--border)", background: "var(--bg-surface-2)" }}
      >
        <iframe
          title={language === "es" ? "Mapa de Charlie's Barbershop" : "Charlie's Barbershop location map"}
          src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=Charlie's+Barbershop,+Carr+2+km+93.3,+Membrillo,+00627,+Puerto+Rico&zoom=15"
          className="w-full block"
          style={{ border: 0, height: 350 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    </div>
  );
}
