"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Sous App Error:", error);
  }, [error]);

  return (
    <div className="mx-auto my-12 max-w-2xl rounded border border-over bg-over-wash p-6 text-over-ink">
      <h2 className="display-sm text-lg font-bold">This page encountered an issue</h2>
      <p className="mt-2 text-sm">{error.message || "An unexpected error occurred."}</p>
      {error.digest && (
        <p className="mt-1 font-mono text-xs text-ink-muted">Code: {error.digest}</p>
      )}
      <div className="mt-5 flex gap-3">
        <button
          onClick={() => reset()}
          className="pill-primary cursor-pointer text-xs"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="pill-secondary cursor-pointer text-xs"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
