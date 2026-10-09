import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/auth/SessionProvider";
import { RequireAuth } from "@/auth/RequireAuth";
import { AnalyticsListener } from "@/components/AnalyticsListener";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { AppShell } from "@/components/layout/AppShell";
import { PageLoading } from "@/components/states";
// Eager-load public marketing pages so crawlers see real content (not «Φόρτωση…»).
import { LandingPage } from "@/pages/marketing/LandingPage";
import { PricingPage } from "@/pages/marketing/PricingPage";

const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("@/pages/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const OverviewPage = lazy(() =>
  import("@/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })),
);
const SearchPage = lazy(() =>
  import("@/pages/SearchPage").then((m) => ({ default: m.SearchPage })),
);
const TenderDetailPage = lazy(() =>
  import("@/pages/TenderDetailPage").then((m) => ({
    default: m.TenderDetailPage,
  })),
);
const OpportunitiesPage = lazy(() =>
  import("@/pages/OpportunitiesPage").then((m) => ({
    default: m.OpportunitiesPage,
  })),
);
const MonitoringPage = lazy(() =>
  import("@/pages/MonitoringPage").then((m) => ({ default: m.MonitoringPage })),
);
const DocumentsPage = lazy(() =>
  import("@/pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const SubmissionsPage = lazy(() =>
  import("@/pages/SubmissionsPage").then((m) => ({
    default: m.SubmissionsPage,
  })),
);
const SavedSearchesPage = lazy(() =>
  import("@/pages/SavedSearchesPage").then((m) => ({
    default: m.SavedSearchesPage,
  })),
);
const ExpiringContractsPage = lazy(() =>
  import("@/pages/ExpiringContractsPage").then((m) => ({
    default: m.ExpiringContractsPage,
  })),
);
const SetupPage = lazy(() =>
  import("@/pages/SetupPage").then((m) => ({ default: m.SetupPage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const SettingsLayout = lazy(() =>
  import("@/pages/settings/SettingsLayout").then((m) => ({
    default: m.SettingsLayout,
  })),
);
const ProfileSettingsPage = lazy(() =>
  import("@/pages/settings/ProfileSettingsPage").then((m) => ({
    default: m.ProfileSettingsPage,
  })),
);
const AppearanceSettingsPage = lazy(() =>
  import("@/pages/settings/AppearanceSettingsPage").then((m) => ({
    default: m.AppearanceSettingsPage,
  })),
);
const CompanySettingsPage = lazy(() =>
  import("@/pages/settings/CompanySettingsPage").then((m) => ({
    default: m.CompanySettingsPage,
  })),
);
const TeamSettingsPage = lazy(() =>
  import("@/pages/settings/TeamSettingsPage").then((m) => ({
    default: m.TeamSettingsPage,
  })),
);
const ActivitiesSettingsPage = lazy(() =>
  import("@/pages/settings/ActivitiesSettingsPage").then((m) => ({
    default: m.ActivitiesSettingsPage,
  })),
);
const NotificationsSettingsPage = lazy(() =>
  import("@/pages/settings/NotificationsSettingsPage").then((m) => ({
    default: m.NotificationsSettingsPage,
  })),
);
const LegalSettingsPage = lazy(() =>
  import("@/pages/settings/LegalSettingsPage").then((m) => ({
    default: m.LegalSettingsPage,
  })),
);
const LegalPublicPage = lazy(() =>
  import("@/pages/legal/LegalPublicPage").then((m) => ({
    default: m.LegalPublicPage,
  })),
);
const SubscriptionPage = lazy(() =>
  import("@/pages/SubscriptionPage").then((m) => ({
    default: m.SubscriptionPage,
  })),
);
const AcceptInvitePage = lazy(() =>
  import("@/pages/AcceptInvitePage").then((m) => ({
    default: m.AcceptInvitePage,
  })),
);

const RouteFallback = () => <PageLoading label="Φόρτωση…" />;

export const App = () => (
  <SessionProvider>
    <CookieConsentBanner />
    <AnalyticsListener />
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/legal/:docId" element={<LegalPublicPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route
              path="tenders/:recordType/:adam"
              element={<TenderDetailPage />}
            />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="submissions" element={<SubmissionsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="saved-searches" element={<SavedSearchesPage />} />
            <Route path="expiring-contracts" element={<ExpiringContractsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="setup" element={<SetupPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfileSettingsPage />} />
              <Route path="appearance" element={<AppearanceSettingsPage />} />
              <Route path="company" element={<CompanySettingsPage />} />
              <Route path="team" element={<TeamSettingsPage />} />
              <Route path="activities" element={<ActivitiesSettingsPage />} />
              <Route
                path="notifications"
                element={<NotificationsSettingsPage />}
              />
              <Route path="legal" element={<LegalSettingsPage />} />
              <Route path="legal/:docId" element={<LegalSettingsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </SessionProvider>
);
