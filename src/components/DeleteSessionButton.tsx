// src/components/DeleteSessionButton.tsx
// セッション統合（同じ日の記録が1つのWorkoutSessionに集約される）により、
// セッション削除がその日の記録すべてを削除する操作になるため、削除前に確認する。
"use client";

interface DeleteSessionButtonProps {
  confirmMessage: string;
}

export default function DeleteSessionButton({ confirmMessage }: DeleteSessionButtonProps) {
  return (
    <button
      type="submit"
      className="text-sm text-red-600 hover:underline"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      セッションを削除
    </button>
  );
}
