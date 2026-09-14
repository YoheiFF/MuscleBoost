// src/components/ProfileForm.tsx
// 設計書1.3節には明記が無いが、profile/page.tsxの「プロフィール更新フォーム」を実装するために追加した補助コンポーネント。
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/profile";

interface ProfileFormProps {
  initialName: string;
  initialDefaultWeightKg: number | null;
  initialHeightCm: number | null;
}

export default function ProfileForm({
  initialName,
  initialDefaultWeightKg,
  initialHeightCm,
}: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [defaultWeightKg, setDefaultWeightKg] = useState(
    initialDefaultWeightKg !== null ? String(initialDefaultWeightKg) : ""
  );
  const [heightCm, setHeightCm] = useState(
    initialHeightCm !== null ? String(initialHeightCm) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const result = await updateProfile({
      name: name || undefined,
      defaultWeightKg: defaultWeightKg ? Number(defaultWeightKg) : undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">プロフィールを更新しました</p>}
      <div>
        <label htmlFor="profile-name" className="block text-sm font-medium">表示名</label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="profile-default-weight" className="block text-sm font-medium">デフォルト体重 (kg)</label>
        <input
          id="profile-default-weight"
          type="number"
          step="0.1"
          value={defaultWeightKg}
          onChange={(e) => setDefaultWeightKg(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="profile-height" className="block text-sm font-medium">身長 (cm)</label>
        <input
          id="profile-height"
          type="number"
          step="0.1"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "保存中..." : "更新する"}
      </button>
    </form>
  );
}
