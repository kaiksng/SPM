import { ROOM_LAYOUT_TYPES, type RoomLayoutType } from "@spm/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoomLayoutsEditor } from "./room-layouts-editor";

const onChange = vi.fn<(next: RoomLayoutType[]) => void>();

beforeEach(() => onChange.mockReset());

describe("RoomLayoutsEditor", () => {
  it("offers every standard layout as a toggle", () => {
    render(<RoomLayoutsEditor value={[]} onChange={onChange} />);

    for (const layout of ROOM_LAYOUT_TYPES) {
      expect(screen.getByRole("button", { name: layout })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByText("Select at least one.")).toBeInTheDocument();
  });

  it("lists the selected layouts", () => {
    render(<RoomLayoutsEditor value={["Theatre", "Banquet"]} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Theatre" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Theatre, Banquet")).toBeInTheDocument();
  });

  it("adds a layout, allowing more than one", async () => {
    render(<RoomLayoutsEditor value={["Theatre"]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Banquet" }));

    expect(onChange).toHaveBeenCalledWith(["Theatre", "Banquet"]);
  });

  it("removes a selected layout", async () => {
    render(<RoomLayoutsEditor value={["Theatre", "Banquet"]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Theatre" }));

    expect(onChange).toHaveBeenCalledWith(["Banquet"]);
  });

  it("lets Venue Staff add a new named layout", async () => {
    const user = userEvent.setup();
    render(<RoomLayoutsEditor value={["Theatre"]} onChange={onChange} />);

    await user.type(screen.getByRole("textbox", { name: "New room layout" }), "U-shape");
    await user.click(screen.getByRole("button", { name: "Add layout" }));

    expect(onChange).toHaveBeenCalledWith(["Theatre", "U-shape"]);
  });

  it.each([
    [true, "border-red-600"],
    [false, "border-slate-200"],
  ])("marks the picker invalid: %s", (invalid, borderClass) => {
    const { container } = render(
      <RoomLayoutsEditor value={[]} onChange={onChange} invalid={invalid} />,
    );

    expect(container.firstElementChild).toHaveClass(borderClass);
  });
});
