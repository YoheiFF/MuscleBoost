// src/components/WeightLogForm.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addWeightLog } from "@/app/actions/profile";
import type { WeightLogDTO } from "@/types";

interface WeightLogFormProps {
  onCreated?: (log: WeightLogDTO) => void;
}

export default function WeightLogForm({ onCreated }: WeightLogFormProps) {
  const router = useRouter();
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await addWeightLog({ weightKg: Number(weightKg) });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const createdWeight = Number(weightKg);
    setWeightKg("");

    if (onCreated) {
      onCreated({ id: result.data.id, weightKg: createdWeight, recordedAt: new Date().toISOString() });
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="weight-log-weight" className="block text-sm font-medium">体重 (kg)</label>
        <input
          id="weight-log-weight"
          type="number"
          step="0.1"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className="mt-1 rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        記録
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
