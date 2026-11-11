"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Trash2,
  X,
} from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "info" | "success";

export interface ConfirmOptions {
  title?: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: React.ReactNode;
}

export interface AlertOptions {
  title?: string;
  message: string | React.ReactNode;
  buttonText?: string;
  variant?: ConfirmVariant;
  icon?: React.ReactNode;
}

interface DialogState {
  isOpen: boolean;
  type: "confirm" | "alert";
  title: string;
  message: string | React.ReactNode;
  confirmText: string;
  cancelText?: string;
  variant: ConfirmVariant;
  icon?: React.ReactNode;
  resolve?: (value: any) => void;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions | string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        const opts: ConfirmOptions =
          typeof options === "string" ? { message: options } : options;

        setDialogState({
          isOpen: true,
          type: "confirm",
          title: opts.title || "Confirm Action",
          message: opts.message,
          confirmText: opts.confirmText || "Confirm",
          cancelText: opts.cancelText || "Cancel",
          variant: opts.variant || "danger",
          icon: opts.icon,
          resolve,
        });
      });
    },
    []
  );

  const alert = useCallback(
    (options: AlertOptions | string): Promise<void> => {
      return new Promise<void>((resolve) => {
        const opts: AlertOptions =
          typeof options === "string" ? { message: options } : options;

        const defaultVariant =
          typeof options === "string" &&
          (options.toLowerCase().includes("failed") || options.toLowerCase().includes("error"))
            ? "danger"
            : "info";

        setDialogState({
          isOpen: true,
          type: "alert",
          title: opts.title || (opts.variant === "danger" || defaultVariant === "danger" ? "Attention Required" : "Notice"),
          message: opts.message,
          confirmText: opts.buttonText || "Dismiss",
          variant: opts.variant || defaultVariant,
          icon: opts.icon,
          resolve,
        });
      });
    },
    []
  );

  const handleClose = (result: boolean) => {
    if (!dialogState) return;
    if (dialogState.resolve) {
      if (dialogState.type === "confirm") {
        dialogState.resolve(result);
      } else {
        dialogState.resolve(undefined);
      }
    }
    setDialogState(null);
  };

  // Keyboard accessibility: Escape to cancel, Enter to confirm/dismiss
  useEffect(() => {
    if (!dialogState?.isOpen) return;

    // Focus confirm button for keyboard users
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose(false);
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (document.activeElement?.tagName === "BUTTON") {
          return;
        }
        e.preventDefault();
        handleClose(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialogState]);

  const getIcon = () => {
    if (dialogState?.icon) return dialogState.icon;
    switch (dialogState?.variant) {
      case "danger":
        return <Trash2 className="h-5 w-5 text-over" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-over" />;
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-under" />;
      case "info":
      default:
        return <Info className="h-5 w-5 text-accent" />;
    }
  };

  const getIconBg = () => {
    switch (dialogState?.variant) {
      case "danger":
        return "bg-over-wash";
      case "warning":
        return "bg-over-wash";
      case "success":
        return "bg-under-wash";
      case "info":
      default:
        return "bg-accent-wash";
    }
  };

  const getConfirmBtnClass = () => {
    switch (dialogState?.variant) {
      case "danger":
        return "bg-over text-on-ink hover:brightness-95";
      case "warning":
        return "bg-over text-on-ink hover:brightness-95";
      case "success":
        return "bg-under text-on-ink hover:brightness-95";
      case "info":
      default:
        return "bg-ink text-on-ink hover:bg-accent";
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}

      {dialogState?.isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md transform rounded border border-rule bg-panel p-6 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Button */}
            <button
              onClick={() => handleClose(false)}
              className="absolute right-3 top-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icon + Title + Message */}
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${getIconBg()}`}>
                {getIcon()}
              </div>

              <div className="flex-1 pr-6">
                <h3 className="display-sm text-base sm:text-lg">
                  {dialogState.title}
                </h3>
                <div className="mt-1.5 text-xs sm:text-sm text-ink-soft leading-relaxed">
                  {dialogState.message}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-rule-soft pt-4">
              {dialogState.type === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleClose(false)}
                    className="pill-secondary"
                  >
                    {dialogState.cancelText || "Cancel"}
                  </button>
                  <button
                    ref={confirmBtnRef}
                    type="button"
                    onClick={() => handleClose(true)}
                    className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-5.5 font-display text-xs font-bold uppercase tracking-[0.08em] transition-all ${getConfirmBtnClass()}`}
                  >
                    {dialogState.confirmText}
                  </button>
                </>
              ) : (
                <button
                  ref={confirmBtnRef}
                  type="button"
                  onClick={() => handleClose(true)}
                  className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full px-5.5 font-display text-xs font-bold uppercase tracking-[0.08em] transition-all ${getConfirmBtnClass()}`}
                >
                  {dialogState.confirmText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
