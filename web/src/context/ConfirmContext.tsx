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
        return <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
      case "info":
      default:
        return <Info className="h-5 w-5 text-[#2f4a7d] dark:text-blue-400" />;
    }
  };

  const getIconBg = () => {
    switch (dialogState?.variant) {
      case "danger":
        return "bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50";
      case "success":
        return "bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50";
      case "info":
      default:
        return "bg-[#f0f4fa] dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-900/50";
    }
  };

  const getConfirmBtnClass = () => {
    switch (dialogState?.variant) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 text-white dark:bg-red-600 dark:hover:bg-red-500 shadow-xs";
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-500 shadow-xs";
      case "success":
        return "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-xs";
      case "info":
      default:
        return "bg-[#1b2b4a] hover:bg-[#2f4a7d] text-white dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs";
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}

      {dialogState?.isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-md transform rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-[#131f37]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close Button */}
            <button
              onClick={() => handleClose(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icon + Title + Message */}
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${getIconBg()}`}>
                {getIcon()}
              </div>

              <div className="flex-1 pr-6">
                <h3 className="text-base sm:text-lg font-bold text-[#1b2b4a] dark:text-slate-100">
                  {dialogState.title}
                </h3>
                <div className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {dialogState.message}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {dialogState.type === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleClose(false)}
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {dialogState.cancelText || "Cancel"}
                  </button>
                  <button
                    ref={confirmBtnRef}
                    type="button"
                    onClick={() => handleClose(true)}
                    className={`cursor-pointer rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${getConfirmBtnClass()}`}
                  >
                    {dialogState.confirmText}
                  </button>
                </>
              ) : (
                <button
                  ref={confirmBtnRef}
                  type="button"
                  onClick={() => handleClose(true)}
                  className={`cursor-pointer w-full rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${getConfirmBtnClass()}`}
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
