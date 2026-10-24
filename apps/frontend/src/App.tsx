import { BrowserRouter, Route, Routes } from "react-router";

import { AuthProvider } from "@/context/auth-context";
import { RequireSession } from "@/guards/require-session";
import { AuthLayout } from "@/routes/AuthLayout";
import { BrowseEventsPage } from "@/routes/BrowseEventsPage";
import { ChangeRequestApplyPage } from "@/routes/ChangeRequestApplyPage";
import { CoordinatorEventEditPage } from "@/routes/CoordinatorEventEditPage";
import { EquipmentPage } from "@/routes/EquipmentPage";
import { EventDetailPage } from "@/routes/EventDetailPage";
import { EventHistoryPage } from "@/routes/EventHistoryPage";
import { EventRegistrationPage } from "@/routes/EventRegistrationPage";
import { EventRequestEditorPage } from "@/routes/EventRequestEditorPage";
import { EventsPage } from "@/routes/EventsPage";
import { EventEquipmentPage } from "@/routes/EventEquipmentPage";
import { EventSafetyCheckPage } from "@/routes/EventSafetyCheckPage";
import { EventVenuePage } from "@/routes/EventVenuePage";
import { FlaggedBookingsPage } from "@/routes/FlaggedBookingsPage";
import { LoginPage } from "@/routes/LoginPage";
import { MyRegistrationsPage } from "@/routes/MyRegistrationsPage";
import { NotFoundPage } from "@/routes/NotFoundPage";
import { PublicPage } from "@/routes/PublicPage";
import { SafetyChecksPage } from "@/routes/SafetyChecksPage";
import { SafetyCheckReviewPage } from "@/routes/SafetyCheckReviewPage";
import { SignupPage } from "@/routes/SignupPage";
import { VenueAvailabilityPage } from "@/routes/VenueAvailabilityPage";
import { VenueBlocksPage } from "@/routes/VenueBlocksPage";
import { VenueDetailPage } from "@/routes/VenueDetailPage";
import { VenueEditorPage } from "@/routes/VenueEditorPage";
import { VenueRequestsPage } from "@/routes/VenueRequestsPage";
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
              <Route path="events" element={<EventsPage />} />
              <Route path="events/new" element={<EventRequestEditorPage />} />
              <Route path="events/:eventId" element={<EventDetailPage />} />
              <Route path="events/:eventId/venue" element={<EventVenuePage />} />
              <Route path="events/:eventId/equipment" element={<EventEquipmentPage />} />
              <Route path="events/:eventId/safety-check" element={<EventSafetyCheckPage />} />
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
              <Route
                path="events/:eventId/change-requests/:changeRequestId/apply"
                element={<ChangeRequestApplyPage />}
              />
              <Route path="venues" element={<VenuesPage />} />
              <Route path="venues/new" element={<VenueEditorPage />} />
              <Route path="venues/:venueId" element={<VenueDetailPage />} />
              <Route path="venues/:venueId/edit" element={<VenueEditorPage />} />
              <Route path="venues/:venueId/blocks" element={<VenueBlocksPage />} />
              <Route
                path="venues/:venueId/availability"
                element={<VenueAvailabilityPage />}
              />
              <Route path="venue-requests" element={<VenueRequestsPage />} />
              <Route path="flagged-bookings" element={<FlaggedBookingsPage />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="equipment/inventory" element={<EquipmentPage section="inventory" />} />
              <Route path="equipment/unavailability" element={<EquipmentPage section="unavailability" />} />
              <Route path="browse-events" element={<BrowseEventsPage />} />
              <Route path="browse-events/my-registrations" element={<MyRegistrationsPage />} />
              <Route path="browse-events/:eventId" element={<EventRegistrationPage />} />
              <Route path="safety-checks" element={<SafetyChecksPage />} />
              <Route path="safety-checks/:eventId" element={<SafetyCheckReviewPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
