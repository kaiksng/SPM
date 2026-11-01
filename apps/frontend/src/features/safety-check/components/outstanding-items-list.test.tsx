import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OutstandingItemsList } from "./outstanding-items-list";

describe("OutstandingItemsList", () => {
  // SPM-33 AC06: submission is blocked with the outstanding items listed.
  it("lists every outstanding item's message", () => {
    render(
      <OutstandingItemsList
        items={[
          { code: "main_venue_not_approved", message: "The main venue booking is not yet Approved." },
          { code: "equipment_needs_review", message: "Review the flagged equipment requirement." },
        ]}
      />,
    );

    const list = screen.getByRole("alert", { name: "Outstanding items" });
    expect(list).toHaveTextContent("The main venue booking is not yet Approved.");
    expect(list).toHaveTextContent("Review the flagged equipment requirement.");
  });

  it("renders nothing when there are no outstanding items", () => {
    const { container } = render(<OutstandingItemsList items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
