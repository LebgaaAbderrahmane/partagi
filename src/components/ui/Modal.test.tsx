import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Modal from "./Modal";

describe("Modal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <Modal open={false} onClose={onClose} title="Hidden">
        body
      </Modal>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders dialog with aria when open", () => {
    render(
      <Modal open onClose={onClose} title="Leave session?">
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent(
      "Leave session?",
    );
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("traps Tab focus inside the dialog", () => {
    render(
      <Modal open onClose={onClose} title="T">
        <button type="button">One</button>
        <button type="button">Two</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const one = screen.getByRole("button", { name: "One" });
    const two = screen.getByRole("button", { name: "Two" });
    const close = screen.getByLabelText("Close");

    dialog.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(one);

    one.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(two);

    two.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);
  });

  it("closes on Escape", () => {
    render(
      <Modal open onClose={onClose} title="T">
        body
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when backdrop is clicked", () => {
    render(
      <Modal open onClose={onClose} title="T">
        body
      </Modal>,
    );
    const backdrop = document.querySelector(".modal-backdrop")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when modal body is clicked", () => {
    render(
      <Modal open onClose={onClose} title="T">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("close button triggers onClose", () => {
    render(
      <Modal open onClose={onClose} title="T">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
