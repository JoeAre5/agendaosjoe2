import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientDuplicateBadgesProvider } from "@/contexts/ClientDuplicateBadgesContext";
import { CLIENT_DUPLICATE_QUERY_ROOT } from "@/lib/clientDuplicateBadges";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { BrandLogosProvider } from "@/contexts/BrandLogosContext";
import { RoleGuard } from "@/components/RoleGuard";
import { PublicLayout } from "@/layouts/PublicLayout";
import { AdminLayout } from "@/layouts/AdminLayout";

import { lazy, Suspense, useEffect } from "react";
import { SplashScreen } from "@/components/SplashScreen";
import { RefCapture } from "@/components/RefCapture";
import { usePwaInstallTracker } from "@/hooks/usePwaInstallTracker";

// Admin pages
const Index = lazy(() => import("./pages/Index"));
const NewAppointment = lazy(() => import("./pages/NewAppointment"));
const EditAppointment = lazy(() => import("./pages/EditAppointment"));
const AppointmentDetail = lazy(() => import("./pages/AppointmentDetail"));
const AdminAppointmentPay = lazy(() => import("./pages/AdminAppointmentPay"));
const NewBlockTime = lazy(() => import("./pages/NewBlockTime"));
const BlockTimeDetail = lazy(() => import("./pages/BlockTimeDetail"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Profit = lazy(() => import("./pages/Profit"));
const Reports = lazy(() => import("./pages/Reports"));
const RetentionOutreach = lazy(() => import("./pages/RetentionOutreach"));
const Contable = lazy(() => import("./pages/Contable"));
const HasibPreview = lazy(() => import("./pages/admin/HasibPreview"));
const ImportCSV = lazy(() => import("./pages/ImportCSV"));
const Clients = lazy(() => import("./pages/Clients"));
const AdminGifts = lazy(() => import("./pages/AdminGifts"));

const Services = lazy(() => import("./pages/Services"));
const Availability = lazy(() => import("./pages/Availability"));
const Settings = lazy(() => import("./pages/Settings"));
const Galleries = lazy(() => import("./pages/admin/Galleries"));
const GalleryEditor = lazy(() => import("./pages/admin/GalleryEditor"));
const Media = lazy(() => import("./pages/admin/Media"));
const Website = lazy(() => import("./pages/admin/Website"));
const Sales = lazy(() => import("./pages/Sales"));
const WalkIn = lazy(() => import("./pages/WalkIn"));
const Waitlist = lazy(() => import("./pages/Waitlist"));
const BookingRules = lazy(() => import("./pages/BookingRules"));
const BarberPaystubs = lazy(() => import("./pages/BarberPaystubs"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const BroadcastsLanding = lazy(() => import("./pages/admin/BroadcastsLanding"));
const BroadcastsManage = lazy(() => import("./pages/admin/BroadcastsManage"));
const BroadcastsCompose = lazy(() => import("./pages/admin/BroadcastsCompose"));
const BroadcastSubscribers = lazy(() => import("./pages/admin/BroadcastSubscribers"));
const OutreachLanding = lazy(() => import("./pages/admin/OutreachLanding"));
const OutreachTemplates = lazy(() => import("./pages/admin/OutreachTemplates"));
const OutreachTemplatesCategory = lazy(() => import("./pages/admin/OutreachTemplatesCategory"));
const OutreachTemplateEditor = lazy(() => import("./pages/admin/OutreachTemplateEditor"));
const OutreachAnalytics = lazy(() => import("./pages/admin/OutreachAnalytics"));
const BroadcastsAnalytics = lazy(() => import("./pages/admin/BroadcastsAnalytics"));
const TitularesLanding = lazy(() => import("./pages/admin/TitularesLanding"));
const Titulares = lazy(() => import("./pages/admin/Titulares"));
const TitularesPerfil = lazy(() => import("./pages/admin/TitularesPerfil"));
const TitularesEditor = lazy(() => import("./pages/admin/TitularesEditor"));
const TitularesAnalytics = lazy(() => import("./pages/admin/TitularesAnalytics"));
const Suscriptores = lazy(() => import("./pages/admin/Suscriptores"));
const ClientLogin = lazy(() => import("./pages/ClientLogin"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ClientPortalV2 = lazy(() => import("./pages/ClientPortalV2"));
const ClientNewAppointment = lazy(() => import("./pages/ClientNewAppointment"));
const ClientReschedule = lazy(() => import("./pages/ClientReschedule"));
const FilhoChat = lazy(() => import("./pages/client/FilhoChat"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const WaitlistPublic = lazy(() => import("./pages/site/Waitlist"));
const LaunchControl = lazy(() => import("./pages/admin/LaunchControl"));
const Bandeja = lazy(() => import("./pages/admin/Bandeja"));
const Performance = lazy(() => import("./pages/admin/Performance"));
const ReferralSystems = lazy(() => import("./pages/admin/ReferralSystems"));
const Roles = lazy(() => import("./pages/admin/Roles"));
const ReferralInternal = lazy(() => import("./pages/admin/ReferralInternal"));
const ReferralOwnerDetail = lazy(() => import("./pages/admin/ReferralOwnerDetail"));
const ClientsNetwork = lazy(() => import("./pages/admin/ClientsNetwork"));
const ClientNetwork = lazy(() => import("./pages/admin/ClientNetwork"));
const ClientDuplicates = lazy(() => import("./pages/admin/ClientDuplicates"));
const RefRedirect = lazy(() => import("./pages/RefRedirect"));

// Public site pages
const Home = lazy(() => import("./pages/site/Home"));
const Booking = lazy(() => import("./pages/site/Booking"));
const Headlines = lazy(() => import("./pages/site/Headlines"));
const HeadlinePost = lazy(() => import("./pages/site/HeadlinePost"));
const JoinTeam = lazy(() => import("./pages/site/JoinTeam"));
const Contact = lazy(() => import("./pages/site/Contact"));
const PrivacyPolicy = lazy(() => import("./pages/site/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/site/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/site/RefundPolicy"));
const BookingPolicy = lazy(() => import("./pages/site/BookingPolicy"));
const CookiePolicy = lazy(() => import("./pages/site/CookiePolicy"));
const RewardsTerms = lazy(() => import("./pages/site/RewardsTerms"));
const ReferralTerms = lazy(() => import("./pages/site/ReferralTerms"));
const ServiciosCortes = lazy(() => import("./pages/site/ServiciosCortes"));
const ServiciosBarba = lazy(() => import("./pages/site/ServiciosBarba"));
const ServiciosExperiencias = lazy(() => import("./pages/site/ServiciosExperiencias"));
const Pay = lazy(() => import("./pages/site/Pay"));
const BookingConfirming = lazy(() => import("./pages/site/BookingConfirming"));
const BookingConfirmed = lazy(() => import("./pages/site/BookingConfirmed"));
const PostBookingLogin = lazy(() => import("./pages/site/PostBookingLogin"));
const InstallBridge = lazy(() => import("./pages/site/InstallBridge"));
const Welcome = lazy(() => import("./pages/site/Welcome"));

// Public site is permanently live (gate removed 2026-05-14).
// /cb-build-2026/* dev mirror removed 2026-05-19 to prevent duplicate-content SEO.

const queryClient = new QueryClient();

// Retention/Outreach caches are per account: drop them whenever the session changes hands.
supabase.auth.onAuthStateChange((event) => {
  // Keys already include user id and role; this also frees memory on sign-out.
  if (event === "SIGNED_OUT") {
    queryClient.removeQueries({ queryKey: ["outreach"] });
    queryClient.removeQueries({ queryKey: ["retention"] });
    queryClient.removeQueries({ queryKey: [CLIENT_DUPLICATE_QUERY_ROOT] });
  }
});

const paypalOptions = {
  clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "ARACHeV9N5CEjhbku1qxYqf9Yp-ieMTTjTOJEuxrmbCUrKS3A5rOH0tojQtIm2rJ7ObshxlNRX7ppQzd",
  currency: "USD",
  intent: "capture",
};


/** Side-effects that need to live inside Router + Auth providers. */
function AppEffects() {
  usePwaInstallTracker();
  return <RefCapture />;
}



const App = () => {
  // Phase 1B.UX — Safari bfcache restoration log. React state already
  // persists naturally when Safari restores from bfcache; URL params drive
  // the rest. This is a debug breadcrumb so we can see in console when a
  // bfcache restore happens vs a fresh load.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // eslint-disable-next-line no-console
        console.log("[bfcache] Safari restored page from cache");
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ClientDuplicateBadgesProvider>
      <PreferencesProvider>
        <BrandLogosProvider>
        <PayPalScriptProvider options={paypalOptions}>
          <TooltipProvider>
            <Sonner />
            <BrowserRouter>
              <AppEffects />
              <Suspense fallback={<SplashScreen />}>
                <Routes>
                  {/* Referral landing — captures ?ref= and redirects to / */}
                  <Route path="/r/:code" element={<RefRedirect />} />
                  {/* Client auth (default — no prefix) */}
                  <Route path="/login" element={<ClientLogin />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/portal" element={<Navigate to="/app/cliente" replace />} />
                  <Route path="/app/cliente" element={<RoleGuard allowedRoles={["client"]} unauthenticatedRedirect="/login" unauthorizedRedirect="/admin"><ClientPortalV2 /></RoleGuard>} />
                  <Route path="/app/cliente/nueva-cita" element={<RoleGuard allowedRoles={["client"]} unauthenticatedRedirect="/login" unauthorizedRedirect="/admin"><ClientNewAppointment /></RoleGuard>} />
                  <Route path="/app/cliente/reagendar" element={<RoleGuard allowedRoles={["client"]} unauthenticatedRedirect="/login" unauthorizedRedirect="/admin"><ClientReschedule /></RoleGuard>} />
                  <Route path="/app/cliente/filho" element={<RoleGuard allowedRoles={["client"]} unauthenticatedRedirect="/login" unauthorizedRedirect="/admin"><FilhoChat /></RoleGuard>} />

                  {/* Admin auth & platform — wrapped in AdminLayout so the
                      desktop/tablet sidebar persists across every sub-route.
                      AdminLayout returns just <Outlet/> on mobile so each
                      page keeps its existing mobile shell. */}
                  <Route path="/admin/login" element={<Navigate to="/login" replace />} />
                  <Route element={<AdminLayout />}>
                    <Route path="/admin" element={<RoleGuard><Index /></RoleGuard>} />
                    <Route path="/admin/appointment/new" element={<RoleGuard><NewAppointment /></RoleGuard>} />
                    <Route path="/admin/appointment/:id/edit" element={<RoleGuard><EditAppointment /></RoleGuard>} />
                    <Route path="/admin/appointment/:id" element={<RoleGuard><AppointmentDetail /></RoleGuard>} />
                    <Route path="/admin/appointment/:id/pay" element={<RoleGuard><AdminAppointmentPay /></RoleGuard>} />
                    <Route path="/admin/block/new" element={<RoleGuard><NewBlockTime /></RoleGuard>} />
                    <Route path="/admin/block/:id" element={<RoleGuard><BlockTimeDetail /></RoleGuard>} />
                    <Route path="/admin/inventory" element={<RoleGuard ownerOnly><Inventory /></RoleGuard>} />
                    <Route path="/admin/profit" element={<RoleGuard ownerOnly><Profit /></RoleGuard>} />
                    <Route path="/admin/reports" element={<RoleGuard ownerOnly><Reports /></RoleGuard>} />
                    <Route path="/admin/retencion/outreach" element={<RoleGuard><RetentionOutreach /></RoleGuard>} />
                    <Route path="/admin/contable" element={<RoleGuard ownerOnly><Contable /></RoleGuard>} />
                    <Route path="/admin/hasib-preview" element={<RoleGuard ownerOnly><HasibPreview /></RoleGuard>} />
                    <Route path="/admin/import" element={<RoleGuard ownerOnly><ImportCSV /></RoleGuard>} />
                    <Route path="/admin/clients" element={<RoleGuard ownerOnly><Clients /></RoleGuard>} />
                    <Route path="/admin/clients/duplicates" element={<RoleGuard ownerOnly><ClientDuplicates /></RoleGuard>} />
                    <Route path="/admin/gifts" element={<RoleGuard ownerOnly><AdminGifts /></RoleGuard>} />

                    <Route path="/admin/performance" element={<RoleGuard ownerOnly><Performance /></RoleGuard>} />
                    <Route path="/admin/referidos" element={<RoleGuard ownerOnly><ReferralSystems /></RoleGuard>} />
                    <Route path="/admin/referidos/interna" element={<RoleGuard ownerOnly><ReferralInternal /></RoleGuard>} />
                    <Route path="/admin/referidos/interna/:slug" element={<RoleGuard ownerOnly><ReferralOwnerDetail /></RoleGuard>} />
                    <Route path="/admin/clients-network" element={<RoleGuard ownerOnly><ClientsNetwork /></RoleGuard>} />
                    <Route path="/admin/client-network" element={<RoleGuard ownerOnly><ClientNetwork /></RoleGuard>} />
                    <Route path="/admin/services" element={<RoleGuard><Services /></RoleGuard>} />
                    <Route path="/admin/availability" element={<RoleGuard ownerOnly><Availability /></RoleGuard>} />
                    <Route path="/admin/settings" element={<RoleGuard ownerOnly><Settings /></RoleGuard>} />
                    <Route path="/admin/roles" element={<RoleGuard ownerOnly><Roles /></RoleGuard>} />
                    <Route path="/admin/galleries" element={<RoleGuard ownerOnly><Galleries /></RoleGuard>} />
                    <Route path="/admin/galleries/home" element={<RoleGuard ownerOnly><GalleryEditor /></RoleGuard>} />
                    <Route path="/admin/galleries/barber/:id" element={<RoleGuard ownerOnly><GalleryEditor /></RoleGuard>} />
                    <Route path="/admin/media" element={<RoleGuard><Media /></RoleGuard>} />
                    <Route path="/admin/website" element={<RoleGuard ownerOnly><Website /></RoleGuard>} />
                    <Route path="/admin/sales" element={<RoleGuard><Sales /></RoleGuard>} />
                    <Route path="/admin/walk-in" element={<RoleGuard><WalkIn /></RoleGuard>} />
                    <Route path="/admin/waitlist" element={<RoleGuard><Waitlist /></RoleGuard>} />
                    <Route path="/admin/booking-rules" element={<RoleGuard ownerOnly><BookingRules /></RoleGuard>} />
                    <Route path="/admin/talonarios" element={<RoleGuard><BarberPaystubs /></RoleGuard>} />
                    <Route path="/admin/notifications" element={<RoleGuard ownerOnly><AdminNotifications /></RoleGuard>} />
                    <Route path="/admin/broadcasts" element={<RoleGuard ownerOnly><BroadcastsLanding /></RoleGuard>} />
                    <Route path="/admin/broadcasts/manage" element={<RoleGuard ownerOnly><BroadcastsManage /></RoleGuard>} />
                    <Route path="/admin/broadcasts/compose" element={<RoleGuard ownerOnly><BroadcastsCompose /></RoleGuard>} />
                    <Route path="/admin/broadcasts/analytics" element={<RoleGuard ownerOnly><BroadcastsAnalytics /></RoleGuard>} />
                    <Route path="/admin/broadcasts/subscribers" element={<RoleGuard ownerOnly><BroadcastSubscribers /></RoleGuard>} />
                    <Route path="/admin/outreach" element={<RoleGuard ownerOnly><OutreachLanding /></RoleGuard>} />
                    <Route path="/admin/outreach/templates" element={<RoleGuard ownerOnly><OutreachTemplates /></RoleGuard>} />
                    <Route path="/admin/outreach/templates/edit/:id" element={<RoleGuard ownerOnly><OutreachTemplateEditor /></RoleGuard>} />
                    <Route path="/admin/outreach/templates/:category" element={<RoleGuard ownerOnly><OutreachTemplatesCategory /></RoleGuard>} />
                    <Route path="/admin/outreach/analytics" element={<RoleGuard ownerOnly><OutreachAnalytics /></RoleGuard>} />
                    <Route path="/admin/titulares" element={<RoleGuard ownerOnly><TitularesLanding /></RoleGuard>} />
                    <Route path="/admin/titulares/posts" element={<RoleGuard ownerOnly><Titulares /></RoleGuard>} />
                    <Route path="/admin/titulares/perfil" element={<RoleGuard ownerOnly><TitularesPerfil /></RoleGuard>} />
                    <Route path="/admin/titulares/analytics" element={<RoleGuard ownerOnly><TitularesAnalytics /></RoleGuard>} />
                    <Route path="/admin/titulares/suscriptores" element={<RoleGuard ownerOnly><Suscriptores /></RoleGuard>} />
                    <Route path="/admin/titulares/nuevo" element={<RoleGuard ownerOnly><TitularesEditor /></RoleGuard>} />
                    <Route path="/admin/titulares/:id" element={<RoleGuard ownerOnly><TitularesEditor /></RoleGuard>} />

                    {/* Barber auth */}
                    <Route path="/admin/launch" element={<RoleGuard ownerOnly><LaunchControl /></RoleGuard>} />
                    <Route path="/admin/bandeja" element={<RoleGuard ownerOnly><Bandeja /></RoleGuard>} />
                  </Route>
                  <Route path="/pros/login" element={<Navigate to="/login" replace />} />


                  {/* ───────────────────────────────────────────────────────────
                      PUBLIC WEBSITE — always live (gate removed 2026-05-14)
                  ─────────────────────────────────────────────────────────── */}
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/citas" element={<Booking />} />
                    <Route path="/citas/:barberSlug" element={<Booking />} />
                    <Route path="/unete" element={<JoinTeam />} />
                    <Route path="/contacto" element={<Contact />} />
                    <Route path="/servicios/cortes" element={<ServiciosCortes />} />
                    <Route path="/servicios/barba" element={<ServiciosBarba />} />
                    <Route path="/servicios/experiencias" element={<ServiciosExperiencias />} />
                  </Route>

                  {/* Booking confirmation pages — bare full-screen, always live */}
                  <Route path="/citas/confirmando" element={<BookingConfirming />} />
                  <Route path="/citas/confirmado" element={<BookingConfirmed />} />
                  <Route path="/citas/acceso" element={<PostBookingLogin />} />
                  <Route path="/citas/instala" element={<InstallBridge />} />

                  {/* Public waitlist enrollment — bare full-screen, no PublicLayout */}
                  <Route path="/lista-exclusiva" element={<WaitlistPublic />} />
                  {/* Referral onboarding — PWA-first, bare full-screen */}
                  <Route path="/bienvenido" element={<Welcome />} />
                  {/* Legal/utility + Boletín — kept live with PublicLayout chrome */}
                  <Route element={<PublicLayout />}>
                    <Route path="/privacidad" element={<PrivacyPolicy />} />
                    <Route path="/terminos" element={<TermsOfService />} />
                    <Route path="/reembolsos" element={<RefundPolicy />} />
                    <Route path="/politica-reservas" element={<BookingPolicy />} />
                    <Route path="/cookies" element={<CookiePolicy />} />
                    <Route path="/cookie-policy" element={<CookiePolicy />} />
                    <Route path="/rewards-terms" element={<RewardsTerms />} />
                    <Route path="/terminos-recompensas" element={<RewardsTerms />} />
                    <Route path="/referral-terms" element={<ReferralTerms />} />
                    <Route path="/terminos-referidos" element={<ReferralTerms />} />
                    <Route path="/titulares" element={<Headlines />} />
                    <Route path="/titulares/:slug" element={<HeadlinePost />} />
                  </Route>




                  {/* Email unsubscribe */}
                  <Route path="/unsubscribe" element={<Unsubscribe />} />

                  {/* Public payment page (token = appointment id) */}
                  <Route path="/pay/:token" element={<Pay />} />

                  {/* Legacy redirects */}
                  <Route path="/app/cliente/login" element={<Navigate to="/login" replace />} />
                  <Route path="/client/login" element={<Navigate to="/login" replace />} />
                  <Route path="/client" element={<Navigate to="/app/cliente" replace />} />
                  <Route path="/admin/pros" element={<Navigate to="/pros/login" replace />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
          </PayPalScriptProvider>
        </BrandLogosProvider>
      </PreferencesProvider>
      </ClientDuplicateBadgesProvider>
    </AuthProvider>
  </QueryClientProvider>
  </HelmetProvider>
  );
};

export default App;
