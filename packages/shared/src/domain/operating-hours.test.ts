import { describe, expect, it } from "vitest";

import { formatOperatingHours } from "./operating-hours";

describe("formatOperatingHours", () => {
  it("says the hours are not set when there are no periods", () => {
    expect(formatOperatingHours([])).toBe("Operating hours not set");
  });

  it("joins consecutive days into a range and lists the remaining days as closed", () => {
    expect(
      formatOperatingHours([
        { days: ["mon", "tue", "wed", "thu", "fri"], opensAt: "09:00", closesAt: "18:00" },
      ]),
    ).toBe("Mon–Fri 9:00 AM – 6:00 PM, Sat–Sun Closed");
  });

  it("sorts days into week order and separates days that are not consecutive", () => {
    expect(
      formatOperatingHours([{ days: ["wed", "mon"], opensAt: "08:30", closesAt: "12:00" }]),
    ).toBe("Mon, Wed 8:30 AM – 12:00 PM, Tue, Thu–Sun Closed");
  });

  it("shows midnight as 12 AM and omits the closed segment when every day is open", () => {
    expect(
      formatOperatingHours([
        {
          days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          opensAt: "00:00",
          closesAt: "23:59",
        },
      ]),
    ).toBe("Mon–Sun 12:00 AM – 11:59 PM");
  });

  it("lists each period separately when days have different hours", () => {
    expect(
      formatOperatingHours([
        { days: ["mon", "tue", "wed", "thu", "fri"], opensAt: "09:00", closesAt: "18:00" },
        { days: ["sat"], opensAt: "10:00", closesAt: "14:00" },
      ]),
    ).toBe("Mon–Fri 9:00 AM – 6:00 PM, Sat 10:00 AM – 2:00 PM, Sun Closed");
  });
});
