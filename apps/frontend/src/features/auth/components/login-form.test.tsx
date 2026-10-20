import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

const loginMock = vi.fn();

vi.mock("@/features/auth/actions/login", () => ({
  login: (...args: unknown[]) => loginMock(...args),
}));

import { LoginForm } from "./login-form";

function renderLoginForm() {
  return render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  );
}

describe("LoginForm", () => {
  it("renders email and password fields with a submit button", () => {
    renderLoginForm();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("shows the email error directly under the email field", async () => {
    loginMock.mockResolvedValue({
      errors: { email: ["Please enter a valid email address."] },
    });

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "something");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const error = await screen.findByText(
      "Please enter a valid email address.",
    );
    expect(error).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Please enter a valid email address.",
    );
  });

  // SPM-13 AC01: a successful sign-in lands the user on their role's view.
  it("SPM-13 AC01: takes a signed-in user to the view the action returns for their role", async () => {
    loginMock.mockResolvedValue({ redirectTo: "/venues" });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="login" element={<LoginForm />} />
          <Route path="venues" element={<p>VENUES PAGE</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "daryl@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("VENUES PAGE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("stays on the sign-in form when the credentials are rejected", async () => {
    loginMock.mockResolvedValue({ message: "Invalid email or password." });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="login" element={<LoginForm />} />
          <Route path="venues" element={<p>VENUES PAGE</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "daryl@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("VENUES PAGE")).not.toBeInTheDocument();
  });

  it("shows a generic error message from the action without rendering raw errors", async () => {
    loginMock.mockResolvedValue({ message: "Invalid email or password." });

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
  });

  it("disables the submit button while pending", async () => {
    let resolveLogin: (value: unknown) => void = () => {};
    loginMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled(),
    );

    resolveLogin({});
  });
});
