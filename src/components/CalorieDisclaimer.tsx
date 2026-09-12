// src/components/CalorieDisclaimer.tsx
// props無し。固定文言「表示される消費カロリーはMET値に基づく目安であり、個人差があります。」を表示する。
export default function CalorieDisclaimer() {
  return (
    <p className="text-xs text-gray-500">
      表示される消費カロリーはMET値に基づく目安であり、個人差があります。
    </p>
  );
}
