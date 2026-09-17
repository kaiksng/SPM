import { BrowserRouter, Route, Routes } from "react-router";

import { AuthProvider } from "@/context/auth-context";
import { RequireSession } from "@/guards/require-session";
import { AuthLayout } from "@/routes/AuthLayout";
import { BrowseEventsPage } from "@/routes/BrowseEventsPage";
import { CoordinatorEventEditPage } from "@/routes/CoordinatorEventEditPage";
import { EquipmentPage } from "@/routes/EquipmentPage";
import { EventDetailPage } from "@/routes/EventDetailPage";
import { EventHistoryPage } from "@/routes/EventHistoryPage";
import { EventRequestEditorPage } from "@/routes/EventRequestEditorPage";
import { EventsPage } from "@/routes/EventsPage";
import { HomePage } from "@/routes/HomePage";
import { LoginPage } from "@/routes/LoginPage";
import { NotFoundPage } from "@/routes/NotFoundPage";
import { PublicPage } from "@/routes/PublicPage";
import { SignupPage } from "@/routes/SignupPage";
import { VenuesPage } from "@/routes/VenuesPage";
import { WorkspaceLayout } from "@/routes/WorkspaceLayout";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route index element={<PublicPage />} />

          <Route element={<AuthLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
          </Route>

          <Route element={<RequireSession />}>
            <Route element={<WorkspaceLayout />}>
              <Route path="home" element={<HomePage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="events/new" element={<EventRequestEditorPage />} />
              <Route path="events/:eventId" element={<EventDetailPage />} />
              <Route path="events/:eventId/history" element={<EventHistoryPage />} />
              <Route
                path="events/:eventId/edit"
                element={<EventRequestEditorPage />}
              />
              <Route
                path="events/:eventId/submit"
                element={<EventRequestEditorPage mode="submit" />}
              />
              <Route
                path="events/:eventId/coordinator-edit"
                element={<CoordinatorEventEditPage />}
              />
              <Route path="venues" element={<VenuesPage />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="browse-events" element={<BrowseEventsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
