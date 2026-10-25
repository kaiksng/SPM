import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const signupMock = vi.fn();

vi.mock("@/features/auth/actions/signup", () => ({
  signup: (...args: unknown[]) => signupMock(...args),
}));

import { SignupForm } from "./signup-form";

function renderSignupForm() {
  return render(
    <MemoryRouter>
      <SignupForm />
    </MemoryRouter>,
  );
}

describe("SignupForm", () => {
  it("renders all four fields and a submit button, with no role dropdown", () => {
    renderSignupForm();

    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Role" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("toggles password visibility independently for each field", async () => {
    const user = userEvent.setup();
    renderSignupForm();

    const password = screen.getByLabelText("Password");
    const confirmPassword = screen.getByLabelText("Confirm password");

    expect(password).toHaveAttribute("type", "password");
    expect(confirmPassword).toHaveAttribute("type", "password");

    const showPasswordButtons = screen.getAllByRole("button", {
      name: "Show password",
    });
    await user.click(showPasswordButtons[0]!);

    expect(password).toHaveAttribute("type", "text");
    expect(confirmPassword).toHaveAttribute("type", "password");
  });

  it("keeps the mismatch message hidden while the user is still typing", async () => {
    const user = userEvent.setup();
    renderSignupForm();

    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-two");

    expect(screen.queryByText("Passwords do not match")).not.toBeInTheDocument();
    // Submit stays blocked even before the message appears, since the
    // passwords genuinely don't match yet.
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeDisabled();
    expect(signupMock).not.toHaveBeenCalled();
  });

  it("shows the mismatch message once the user leaves the confirm-password field", async () => {
    const user = userEvent.setup();
    renderSignupForm();

    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-two");
    await user.tab();

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeDisabled();
  });

  it("clears the mismatch message and re-enables submit once the fields match", async () => {
    const user = userEvent.setup();
    renderSignupForm();

    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-two");
    await user.tab();
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "password-one");

    expect(screen.queryByText("Passwords do not match")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).not.toBeDisabled();
  });

  it("shows each field's server-returned error directly under that field", async () => {
    signupMock.mockResolvedValue({
      errors: {
        fullName: ["Full name must be at least 2 characters."],
        email: ["Please enter a valid email address."],
      },
    });

    const user = userEvent.setup();
    renderSignupForm();

    await user.type(screen.getByLabelText("Full name"), "J");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-one");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await screen.findByText("Full name must be at least 2 characters.");

    expect(screen.getByLabelText("Full name")).toHaveAccessibleDescription(
      "Full name must be at least 2 characters.",
    );
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Please enter a valid email address.",
    );
  });

  it("shows a generic message from the action for a duplicate email", async () => {
    signupMock.mockResolvedValue({
      message:
        "We couldn't create your account with those details. Try signing in instead.",
    });

    const user = userEvent.setup();
    renderSignupForm();

    await user.type(screen.getByLabelText("Full name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-one");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create your account with those details. Try signing in instead.",
    );
  });
});
