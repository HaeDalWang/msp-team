export function currentWeek(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${pick("year")}-${pick("month")}-${pick("day")}`;
  const daysSinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(Date.parse(`${today}T00:00:00Z`) - daysSinceMonday * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function moveWeek(week: string, steps: number): string {
  return new Date(Date.parse(`${week}T00:00:00Z`) + steps * 7 * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function validWeek(value: string | null): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value &&
    new Date(`${value}T00:00:00Z`).getUTCDay() === 1
  );
}
