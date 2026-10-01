import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { useRoomLayoutOptions } from "./use-room-layout-options";

it("offers a layout saved by Venue Staff to other forms", async () => {
  fromMock.mockReturnValue({
    select: () => Promise.resolve({ data: [{ layout_name: "U-shape" }], error: null }),
  });

  const { result } = renderHook(() => useRoomLayoutOptions());
  await waitFor(() => expect(result.current).toContain("U-shape"));
  expect(result.current).toContain("Theatre");
  expect(fromMock).toHaveBeenCalledWith("venue_layouts");
});
