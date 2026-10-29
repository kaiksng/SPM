import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./modal";

afterEach(() => {
  document.body.style.overflow = "";
});

describe("Modal", () => {
  // UI bug: scrolling over a long dialog moved the page behind it instead.
  it("stops the page behind from scrolling while it is open, and restores it after", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <Modal titleId="t" title="Pick one" onCancel={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("scrolls a long body inside the dialog, which is never taller than the screen", () => {
    render(
      <Modal titleId="t" title="Pick one" onCancel={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Pick one" });
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]");
    expect(screen.getByText("Body").parentElement).toHaveClass("overflow-y-auto");
  });

  it("closes on Escape", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal titleId="t" title="Pick one" onCancel={onCancel}>
        <p>Body</p>
      </Modal>,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });
});
