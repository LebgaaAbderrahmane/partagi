import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Avatar from "./Avatar";
import Badge from "./Badge";
import Button from "./Button";

describe("Avatar", () => {
  it("shows uppercase initials from name", () => {
    const { container } = render(<Avatar name="Ada Lovelace" />);
    expect(container.textContent).toBe("AD");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies active class when active", () => {
    const { container } = render(<Avatar name="Ab" active />);
    expect(container.firstChild).toHaveClass("avatar-active");
  });
});

describe("Badge", () => {
  it("renders children with variant class", () => {
    const { container } = render(<Badge variant="success">sharing</Badge>);
    expect(container.textContent).toBe("sharing");
    expect(container.firstChild).toHaveClass("badge-success");
  });

  it("defaults to base badge class", () => {
    const { container } = render(<Badge>plain</Badge>);
    expect(container.firstChild).toHaveClass("badge");
    expect(container.firstChild).not.toHaveClass("badge-success");
  });
});

describe("Button", () => {
  it("maps variant and size to classes", () => {
    const { getByRole } = render(
      <Button variant="danger" size="lg">
        Leave
      </Button>,
    );
    const btn = getByRole("button", { name: "Leave" });
    expect(btn).toHaveClass("btn-danger", "btn-lg");
  });

  it("passes disabled attribute", () => {
    const { getByRole } = render(<Button disabled>Go</Button>);
    expect(getByRole("button", { name: "Go" })).toBeDisabled();
  });
});
