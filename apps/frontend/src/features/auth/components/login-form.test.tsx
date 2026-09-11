import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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
