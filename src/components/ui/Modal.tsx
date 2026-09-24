import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const root = dialogRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      e.preventDefault();
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !root.contains(active) || active === root) {
        if (e.shiftKey) lastEl.focus();
        else firstEl.focus();
        return;
      }

      const idx = nodes.indexOf(active);
      if (e.shiftKey) {
        if (idx <= 0) lastEl.focus();
        else nodes[idx - 1].focus();
      } else {
        if (idx === -1 || idx >= nodes.length - 1) firstEl.focus();
        else nodes[idx + 1].focus();
      }
    };

    window.addEventListener("keydown", onEscape);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onEscape);
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          {title ? (
            <p className="modal-title" id={titleId}>
              {title}
            </p>
          ) : (
            <span />
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
