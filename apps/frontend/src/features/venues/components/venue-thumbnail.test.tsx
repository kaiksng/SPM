import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VenueThumbnail } from "./venue-thumbnail";

describe("VenueThumbnail", () => {
  it("shows the photo for the venue's layout", () => {
    const { container } = render(<VenueThumbnail layouts={["Theatre", "Banquet"]} />);

    const image = container.querySelector("img");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", expect.stringContaining("theatre"));
    // Decorative: the venue's name is always beside it.
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back to the same-size building icon when the venue has no recognised layout", () => {
    const { container } = render(<VenueThumbnail layouts={["Some legacy value"]} />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("venue-thumbnail")).toHaveClass("size-20", "rounded-xl");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("uses one size and shape whether it is a photo or the fallback", () => {
    const { rerender } = render(<VenueThumbnail layouts={["Theatre"]} />);
    const photoClasses = screen.getByTestId("venue-thumbnail").className;
    rerender(<VenueThumbnail layouts={[]} />);
    const fallbackClasses = screen.getByTestId("venue-thumbnail").className;

    for (const className of ["size-20", "shrink-0", "rounded-xl", "hidden", "sm:"]) {
      expect(photoClasses).toContain(className);
      expect(fallbackClasses).toContain(className);
    }
  });
});
