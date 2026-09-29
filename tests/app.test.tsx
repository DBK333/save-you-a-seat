import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";

function show(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("desktop app behavior", () => {
  it("provides place discovery and personal booking navigation", () => {
    show();
    expect(screen.getByRole("link", { name: "Explore" })).toBeVisible();
    expect(screen.getByRole("link", { name: "My bookings" })).toBeVisible();
    expect(screen.getByText(/demonstration/i)).toBeVisible();
  });

  it("offers separate regular and staff sign-in experiences", async () => {
    show("/login");
    expect(
      screen.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /continue as alex/i }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: /staff sign in/i }));
    expect(
      screen.getByRole("heading", { name: /staff sign in/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /continue as taylor/i }),
    ).toBeVisible();
  });

  it("explains the unconnected demo recovery flow without requesting a stored password", async () => {
    show("/forgot-password");
    expect(
      screen.getByRole("heading", { name: /reset your password/i }),
    ).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });
});
