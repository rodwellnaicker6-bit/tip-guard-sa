/**
 * Client-side loyalty snapshot until server-backed rewards ship.
 */
const STREAK_KEY = "tipguard_tip_streak";
const LAST_DAY_KEY = "tipguard_last_tip_day";
const POINTS_KEY = "tipguard_reward_points";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isYesterday(lastDay: string, today: string): boolean {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) === lastDay;
}

export function recordSuccessfulTip(): { streak: number; points: number } {
  if (typeof localStorage === "undefined") return { streak: 0, points: 0 };
  const day = todayKey();
  const last = localStorage.getItem(LAST_DAY_KEY);
  let streak = Number(localStorage.getItem(STREAK_KEY) || "0") || 0;
  const prevPoints = Number(localStorage.getItem(POINTS_KEY) || "0") || 0;
  const points = prevPoints + 10;

  if (last === day) {
    localStorage.setItem(POINTS_KEY, String(points));
    return { streak, points };
  }

  if (!last) streak = 1;
  else if (isYesterday(last, day)) streak += 1;
  else streak = 1;

  localStorage.setItem(LAST_DAY_KEY, day);
  localStorage.setItem(STREAK_KEY, String(streak));
  localStorage.setItem(POINTS_KEY, String(points));
  return { streak, points };
}

export function getLoyaltySnapshot(): { streak: number; points: number } {
  if (typeof localStorage === "undefined") return { streak: 0, points: 0 };
  return {
    streak: Number(localStorage.getItem(STREAK_KEY) || "0") || 0,
    points: Number(localStorage.getItem(POINTS_KEY) || "0") || 0,
  };
}
