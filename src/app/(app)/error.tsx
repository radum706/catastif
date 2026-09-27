"use client";

import { t } from "@/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card p-5">
      <p className="font-medium text-out">{t.errors.generic}</p>
      <p className="mt-1 text-sm text-muted">{error.message}</p>
      <button className="btn mt-4" onClick={reset}>
        {t.errors.retry}
      </button>
    </div>
  );
}
