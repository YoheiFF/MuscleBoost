// src/app/workouts/new/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createWorkoutSession } from "@/app/actions/workouts";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewWorkoutSessionPage() {
  const router = useRouter();
  const [performedAt, setPerformedAt] = useState(toDatetimeLocalValue(new Date()));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await createWorkoutSession({
      performedAt,
      memo: memo || undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/workouts/${result.data.id}`);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-bold">新規セッション</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label htmlFor="new-session-performed-at" className="block text-sm font-medium">実施日時</label>
          <input
            id="new-session-performed-at"
            type="datetime-local"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="new-session-memo" className="block text-sm font-medium">メモ（任意）</label>
          <textarea
            id="new-session-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "作成中..." : "セッションを作成して記録を始める"}
        </button>
      </form>
    </div>
  );
}
