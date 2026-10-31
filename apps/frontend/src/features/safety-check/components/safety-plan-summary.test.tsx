import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { SafetyPlanSummary } from "./safety-plan-summary";

function renderSummary(props: Partial<Parameters<typeof SafetyPlanSummary>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SafetyPlanSummary
        eventId="event-1"
        emergencyAccessChecked
        restrictionsChecked={false}
        crowdMovementChecked
        equipmentPlacement={null}
        hasEquipment
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("SafetyPlanSummary (SPM-90)", () => {
  it("summarises which safety checks are done, linking to where they're recorded", () => {
    renderSummary();

    expect(within(screen.getByText("Emergency access checked")).getByRole("img")).toHaveAccessibleName("Done");
    expect(within(screen.getByText("Known restrictions checked")).getByRole("img")).toHaveAccessibleName("Not done");
    expect(within(screen.getByText("Equipment placement recorded")).getByRole("img")).toHaveAccessibleName("Not done");
    expect(screen.getByRole("link", { name: "Venue step" })).toHaveAttribute("href", "/events/event-1/venue");
    expect(screen.getByRole("link", { name: "Equipment step" })).toHaveAttribute("href", "/events/event-1/equipment");
  });

  it("leaves out equipment placement when the event has no equipment", () => {
    renderSummary({ hasEquipment: false });

    expect(screen.queryByText("Equipment placement recorded")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Equipment step" })).not.toBeInTheDocument();
  });
});
