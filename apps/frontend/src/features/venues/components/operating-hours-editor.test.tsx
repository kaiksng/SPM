import type { OperatingHours } from "@spm/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperatingHoursEditor } from "./operating-hours-editor";

const onChange = vi.fn<(next: OperatingHours) => void>();

const weekdays: OperatingHours = [
  { days: ["mon", "tue", "wed", "thu", "fri"], opensAt: "09:00", closesAt: "18:00" },
];

beforeEach(() => onChange.mockReset());

describe("OperatingHoursEditor", () => {
  it("shows the selected days, times and closed days", () => {
    render(<OperatingHoursEditor value={weekdays} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sat" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Opens")).toHaveValue("09:00");
    expect(screen.getByLabelText("Closes")).toHaveValue("18:00");
    expect(screen.getByText("Closed: Sat, Sun")).toBeInTheDocument();
  });

  it("says the venue is open every day when all seven are selected", () => {
    render(
      <OperatingHoursEditor
        value={[
          {
            days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            opensAt: "09:00",
            closesAt: "18:00",
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Open every day.")).toBeInTheDocument();
  });

  it("falls back to a 09:00-18:00 period with no days when the value is empty", () => {
    render(<OperatingHoursEditor value={[]} onChange={onChange} />);

    expect(screen.getByLabelText("Opens")).toHaveValue("09:00");
    expect(screen.getByLabelText("Closes")).toHaveValue("18:00");
    expect(screen.getByText("Closed: Mon, Tue, Wed, Thu, Fri, Sat, Sun")).toBeInTheDocument();
  });

  it("adds an unselected day", async () => {
    render(<OperatingHoursEditor value={weekdays} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Sat" }));

    expect(onChange).toHaveBeenCalledWith([
      { days: ["mon", "tue", "wed", "thu", "fri", "sat"], opensAt: "09:00", closesAt: "18:00" },
    ]);
  });

  it("removes a selected day", async () => {
    render(<OperatingHoursEditor value={weekdays} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Wed" }));

    expect(onChange).toHaveBeenCalledWith([
      { days: ["mon", "tue", "thu", "fri"], opensAt: "09:00", closesAt: "18:00" },
    ]);
  });

  it("updates the opening and closing times, keeping the days", () => {
    render(<OperatingHoursEditor value={weekdays} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Opens"), { target: { value: "08:00" } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...weekdays[0], opensAt: "08:00" }]);

    fireEvent.change(screen.getByLabelText("Closes"), { target: { value: "20:00" } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...weekdays[0], closesAt: "20:00" }]);
  });
});
