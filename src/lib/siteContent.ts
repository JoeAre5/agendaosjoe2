/**
 * Site content schema — single source of truth for editable copy on the
 * public website. All values live as a JSONB blob on shop_settings.site_content
 * (live) and shop_settings.draft_site_content (CMS staging).
 *
 * Default values mirror the literal strings currently hardcoded in
 * src/pages/site/Home.tsx, PublicNav.tsx, PublicFooter.tsx and
 * InstallHomeScreenSection.tsx, so removing the override gracefully restores
 * today's behavior.
 */

export type Bi = { es: string; en: string };

export type SiteContent = {
  header: {
    brand_top: string;
    brand_bottom: string;
    sign_in: Bi;
    sign_in_mobile: Bi;
  };
  hero: {
    eyebrow: Bi;
    title: Bi;
    subtitle: Bi;
    rating_label: Bi;
    rating_value: string;
    primary_cta: Bi;
    /** "book" opens booking flow; otherwise treated as URL/path. */
    primary_cta_link: string;
  };
  reviews: {
    eyebrow: Bi;
  };
  services: {
    eyebrow: Bi;
    disclaimer: Bi;
    tabs: { es: string; en: string }[];
  };
  team: {
    eyebrow: Bi;
    book_label: Bi;
  };
  install: {
    eyebrow: Bi;
    title: Bi;
    subtitle: Bi;
    paragraph: Bi;
    cta: Bi;
    helper: Bi;
  };
  blog: {
    eyebrow: Bi;
    view_all_label: Bi;
  };
  grid: {
    eyebrow: Bi;
  };
  faq: {
    eyebrow: Bi;
    items: { q: Bi; a: Bi }[];
  };
  instagram: {
    eyebrow: Bi;
  };
  cta: {
    title: Bi;
    subtitle: Bi;
    primary_label: Bi;
    primary_link: string;
    secondary_label: Bi;
    secondary_link: string;
  };
  footer: {
    brand: string;
    tagline: Bi;
    links_heading: Bi;
    legal_heading: Bi;
    contact_heading: Bi;
    address_line1: string;
    address_line2: string;
    phone: string;
    hours: Bi;
    copyright_entity: string;
    rights: Bi;
  };
  /** Per-section public visibility. Missing key = visible. */
  visibility?: Partial<Record<
    | "header" | "sidebar-logo" | "hero" | "reviews" | "services"
    | "barber-profiles" | "barber-galleries" | "install" | "blog"
    | "home-grid" | "faq" | "instagram" | "cta" | "contact" | "footer",
    boolean
  >>;
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  header: {
    brand_top: "CHARLIE'S",
    brand_bottom: "BARBERSHOP",
    sign_in: { es: "Mi Perfil", en: "My Profile" },
    sign_in_mobile: { es: "Mi Perfil", en: "My Profile" },
  },
  hero: {
    eyebrow: { es: "CHARLIE'S BARBERSHOP", en: "CHARLIE'S BARBERSHOP" },
    title: {
      es: "La Barbería Mejor Calificada en Camuy",
      en: "The Highest Rated Barbershop in Camuy",
    },
    subtitle: {
      es: "Más que cortes. Una experiencia. Reserva hoy y descubre por qué somos los #1.",
      en: "More than haircuts. An experience. Book today and see why we're #1.",
    },
    rating_label: { es: "Google Reviews", en: "Google Reviews" },
    rating_value: "5.0",
    primary_cta: { es: "Reservar Ahora", en: "Book Now" },
    primary_cta_link: "book",
  },
  reviews: {
    eyebrow: { es: "Reseñas", en: "Reviews" },
  },
  services: {
    eyebrow: { es: "Servicios", en: "Services" },
    disclaimer: {
      es: "Los precios pueden variar según el barbero y el servicio",
      en: "Prices may vary by barber and service",
    },
    tabs: [
      { es: "Cortes", en: "Cuts" },
      { es: "Barba", en: "Beard" },
      { es: "Experiencias", en: "Experiences" },
    ],
  },
  team: {
    eyebrow: { es: "El Equipo", en: "The Team" },
    book_label: { es: "Reservar", en: "Book" },
  },
  install: {
    eyebrow: { es: "SIGUIENTE PASO", en: "NEXT STEP" },
    title: { es: "Tus citas, a un click", en: "Your bookings, one tap away" },
    subtitle: {
      es: "Añade Charlie's Barbershop a tu pantalla de inicio",
      en: "Add Charlie's Barbershop to your home screen",
    },
    paragraph: {
      es: "Maneja tus citas, recibe recordatorios y accede a tu experiencia completa desde tu teléfono.",
      en: "Manage your bookings, get reminders, and access your full experience from your phone.",
    },
    cta: { es: "Añadir a inicio", en: "Add to Home Screen" },
    helper: {
      es: "Luego te mostraremos cómo añadirla a tu inicio.",
      en: "Next we'll show you how to add it to your home screen.",
    },
  },
  blog: {
    eyebrow: { es: "Titulares", en: "Headlines" },
    view_all_label: { es: "Ver Todos →", en: "View All →" },
  },
  grid: {
    eyebrow: { es: "Nuestro Espacio", en: "Our Space" },
  },
  faq: {
    eyebrow: { es: "Preguntas Frecuentes", en: "FAQ" },
    items: [
      {
        q: { es: "¿Necesito cita previa?", en: "Do I need an appointment?" },
        a: {
          es: "Aceptamos citas y walk-ins. Para garantizar tu espacio, te recomendamos reservar en línea.",
          en: "We accept appointments and walk-ins. To guarantee your spot, we recommend booking online.",
        },
      },
      {
        q: { es: "¿Cuáles son los métodos de pago?", en: "What payment methods do you accept?" },
        a: {
          es: "Aceptamos efectivo, tarjeta de crédito/débito, ATH Móvil, Apple Pay y PayPal.",
          en: "We accept cash, credit/debit cards, ATH Móvil, Apple Pay, and PayPal.",
        },
      },
      {
        q: { es: "¿Dónde están ubicados?", en: "Where are you located?" },
        a: {
          es: "Estamos en PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627.",
          en: "We're at PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627.",
        },
      },
      {
        q: { es: "¿Cuál es el horario?", en: "What are your hours?" },
        a: {
          es: "Martes a Sábado de 9:00 AM a 5:00 PM. Domingos y Lunes cerrado.",
          en: "Tuesday to Saturday from 9:00 AM to 5:00 PM. Closed Sundays and Mondays.",
        },
      },
    ],
  },
  instagram: {
    eyebrow: { es: "Lo Último", en: "The Latest" },
  },
  cta: {
    title: { es: "¿Listo para reservar?", en: "Ready to book?" },
    subtitle: {
      es: "Asegura tu próxima cita en segundos.",
      en: "Lock in your next appointment in seconds.",
    },
    primary_label: { es: "Reservar", en: "Book" },
    primary_link: "book",
    secondary_label: { es: "Contáctanos", en: "Contact us" },
    secondary_link: "/contacto",
  },
  footer: {
    brand: "CHARLIE'S BARBERSHOP",
    tagline: {
      es: "La barbería mejor calificada en Camuy, Puerto Rico.",
      en: "The highest rated barbershop in Camuy, Puerto Rico.",
    },
    links_heading: { es: "Enlaces", en: "Links" },
    legal_heading: { es: "Legal", en: "Legal" },
    contact_heading: { es: "Contacto & Info", en: "Contact & Info" },
    address_line1: "PR-2 Km 93.3 Bo. Membrillo",
    address_line2: "Camuy, PR 00627",
    phone: "+1 (787) 348-1281",
    hours: { es: "Martes a Sábado 9am a 5pm", en: "Tue-Sat 9am-5pm" },
    copyright_entity: "C&O Ventures LLC",
    rights: { es: "Todos los derechos reservados.", en: "All rights reserved." },
  },
};

/** Deep-merge a partial override into the defaults, returning a full SiteContent. */
export function mergeSiteContent(override?: any): SiteContent {
  if (!override || typeof override !== "object") return DEFAULT_SITE_CONTENT;
  const out: any = {};
  for (const sectionKey of Object.keys(DEFAULT_SITE_CONTENT) as (keyof SiteContent)[]) {
    const def = (DEFAULT_SITE_CONTENT as any)[sectionKey];
    const ov  = override[sectionKey];
    if (!ov || typeof ov !== "object") { out[sectionKey] = def; continue; }
    const merged: any = {};
    for (const fk of Object.keys(def)) {
      const dv = def[fk];
      const vv = ov[fk];
      if (vv === undefined || vv === null) { merged[fk] = dv; continue; }
      // bilingual { es, en }
      if (dv && typeof dv === "object" && !Array.isArray(dv) && "es" in dv && "en" in dv) {
        merged[fk] = { es: vv.es ?? dv.es, en: vv.en ?? dv.en };
      } else {
        merged[fk] = vv;
      }
    }
    out[sectionKey] = merged;
  }
  // Visibility lives outside the per-section defaults — pass through any overrides.
  if (override.visibility && typeof override.visibility === "object") {
    out.visibility = { ...override.visibility };
  }
  return out as SiteContent;
}

/** Pick a bilingual value. */
export function bi(v: Bi, language: string) {
  return language === "es" ? v.es : v.en;
}
