import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./modal";

afterEach(() => {
  document.body.style.overflow = "";
});

describe("Modal", () => {
  // UI bug: scrolling over a long dialog moved the page behind it instead.
  it("stops the page behind from scrolling while it is open, and lets it scroll again after", () => {
    const { unmount } = render(
      <Modal titleId="t" title="Pick one" onCancel={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  // UI bug: a dialog opened from a menu saved the menu's lock and put it back,
  // so the page could not scroll after the dialog closed.
  it("lets the page scroll after closing even if something else had locked it when it opened", () => {
    document.body.style.overflow = "hidden";
    const { unmount } = render(
      <Modal titleId="t" title="Pick one" onCancel={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the page locked until the last of two open dialogs closes", () => {
    const first = render(
      <Modal titleId="a" title="First" onCancel={vi.fn()}>
        <p>A</p>
      </Modal>,
    );
    const second = render(
      <Modal titleId="b" title="Second" onCancel={vi.fn()}>
        <p>B</p>
      </Modal>,
    );

    second.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    first.unmount();
    expect(document.body.style.overflow).toBe("");
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
