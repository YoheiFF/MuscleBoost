// src/components/AchievementBadges.tsx
import type { AchievementBadgeDTO, AchievementBadgesDTO } from "@/types";

interface AchievementBadgesProps {
  badges: AchievementBadgesDTO;
}

function BadgeChip({ badge, icon }: { badge: AchievementBadgeDTO; icon: string }) {
  return (
    <div
      className={
        badge.achieved
          ? "flex flex-col items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-center"
          : "flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-center opacity-50"
      }
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-gray-700">{badge.label}</span>
      {!badge.achieved && (
        <span className="text-[10px] text-gray-400">あと{badge.threshold - badge.achievedValue}</span>
      )}
    </div>
  );
}

export default function AchievementBadges({ badges }: AchievementBadgesProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">達成バッジ</h3>
      <p className="mb-2 text-xs text-gray-500">連続日数</p>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {badges.streakBadges.map((b) => (
          <BadgeChip key={b.id} badge={b} icon="🔥" />
        ))}
      </div>
      <p className="mb-2 text-xs text-gray-500">累計セッション数</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {badges.sessionCountBadges.map((b) => (
          <BadgeChip key={b.id} badge={b} icon="🏅" />
        ))}
      </div>
    </div>
  );
}
