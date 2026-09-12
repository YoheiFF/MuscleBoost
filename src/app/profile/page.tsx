// src/app/profile/page.tsx
import { listWeightLogs } from "@/app/actions/profile";
import { getCurrentUserOrThrow } from "@/lib/session-guard";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/ProfileForm";
import WeightLogForm from "@/components/WeightLogForm";

export default async function ProfilePage() {
  const user = await getCurrentUserOrThrow();
  const [dbUser, weightLogs] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    listWeightLogs(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-bold">プロフィール</h1>
        <ProfileForm initialName={dbUser?.name ?? ""} initialDefaultWeightKg={dbUser?.defaultWeightKg ?? null} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">体重履歴</h2>
        <WeightLogForm />
        <ul className="mt-4 flex flex-col gap-2">
          {weightLogs.map((w) => (
            <li key={w.id} className="flex justify-between rounded border border-gray-200 bg-white p-3 text-sm">
              <span>{new Date(w.recordedAt).toLocaleDateString("ja-JP")}</span>
              <span>{w.weightKg} kg</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
