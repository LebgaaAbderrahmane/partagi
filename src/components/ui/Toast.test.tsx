import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function Probe() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast("Boom", "error")}>fire-error</button>
      <button onClick={() => toast("Ok", "success")}>fire-success</button>
    </div>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    cleanup();
  });

  it("throws when useToast used outside provider", () => {
    function Bad() {
      useToast();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it("shows toast and auto-dismisses after 5s", () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire-error"));
    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByText("Boom").closest(".toast")).toHaveClass(
      "toast-error",
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Boom")).toBeNull();
  });

  it("dismiss button removes toast immediately", () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire-success"));
    expect(screen.getByText("Ok")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Ok")).toBeNull();
  });

  it("supports multiple toasts", () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire-error"));
    fireEvent.click(screen.getByText("fire-success"));
    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByText("Ok")).toBeInTheDocument();
  });
});
