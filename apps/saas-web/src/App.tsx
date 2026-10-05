import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/auth/SessionProvider";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { SearchPage } from "@/pages/SearchPage";
import { TenderDetailPage } from "@/pages/TenderDetailPage";
import { OpportunitiesPage } from "@/pages/OpportunitiesPage";
import { MonitoringPage } from "@/pages/MonitoringPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { SubmissionsPage } from "@/pages/SubmissionsPage";
import { SavedSearchesPage } from "@/pages/SavedSearchesPage";
import { SetupPage } from "@/pages/SetupPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import { ProfileSettingsPage } from "@/pages/settings/ProfileSettingsPage";
import { AppearanceSettingsPage } from "@/pages/settings/AppearanceSettingsPage";
import { CompanySettingsPage } from "@/pages/settings/CompanySettingsPage";
import { TeamSettingsPage } from "@/pages/settings/TeamSettingsPage";
import { ActivitiesSettingsPage } from "@/pages/settings/ActivitiesSettingsPage";
import { NotificationsSettingsPage } from "@/pages/settings/NotificationsSettingsPage";
import { LegalSettingsPage } from "@/pages/settings/LegalSettingsPage";
import { LegalPublicPage } from "@/pages/legal/LegalPublicPage";
import { SubscriptionPage } from "@/pages/SubscriptionPage";
import { AcceptInvitePage } from "@/pages/AcceptInvitePage";

export const App = () => (
  <SessionProvider>
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
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
          <Route path="tenders/:recordType/:adam" element={<TenderDetailPage />} />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="submissions" element={<SubmissionsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="saved-searches" element={<SavedSearchesPage />} />
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
            <Route path="notifications" element={<NotificationsSettingsPage />} />
            <Route path="legal" element={<LegalSettingsPage />} />
            <Route path="legal/:docId" element={<LegalSettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  </SessionProvider>
);
