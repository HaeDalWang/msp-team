import type { Review } from "@/lib/api";

type Snapshot = {
  reviewEnd: string;
  entries: Review[];
  totalTickets: number;
};

const lines = (value: string) => value.split("\n").map((item) => item.trim());
const unique = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export function weeksInMonth(reviewEnd: string) {
  const [year, month] = reviewEnd.split("-").map(Number);
  const weeks: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === 1) weeks.push(date.toISOString().slice(0, 10));
  }
  return weeks;
}

function indent(items: string[]) {
  return items.length
    ? items.map((item) => `  * ${item}`).join("\n")
    : "  * 집계된 항목 없음";
}

export function buildMonthlyTeamOutput(reviewEnd: string, snapshots: Snapshot[]) {
  const [year, month] = reviewEnd.split("-");
  const selected = snapshots.filter((snapshot) =>
    snapshot.reviewEnd.startsWith(`${year}-${month}-`),
  );
  const entries = selected.flatMap((snapshot) => snapshot.entries);
  const totalTickets = selected.reduce(
    (sum, snapshot) => sum + snapshot.totalTickets,
    0,
  );
  const workByPerson = new Map<string, string[]>();
  for (const entry of entries) {
    const key = entry.name || "주요 업무";
    workByPerson.set(
      key,
      unique([...(workByPerson.get(key) ?? []), ...lines(entry.workHighlights)]),
    );
  }
  const workLines = [...workByPerson.entries()].flatMap(([name, items]) => [
    `  * ${name}`,
    ...items.map((item) => `    * ${item}`),
  ]);
  const projects = unique(
    entries.flatMap((entry) => [
      ...lines(entry.actionItems),
      ...lines(entry.topsProjects),
    ]),
  );
  const notes = unique(entries.flatMap((entry) => lines(entry.otherNotes)));
  const title = `${year}년 ${Number(month)}월 MSP 팀 Output`;
  const markdown = [
    "### 2. MSP 팀",
    "",
    "* **업무 현황 지표**",
    `  * 총 티켓 처리 건수: **${totalTickets}건**`,
    "* 주요 업무 현황",
    workLines.length ? workLines.join("\n") : "  * 집계된 항목 없음",
    "* 프로젝트/과제 현황",
    indent(projects),
    "* 기타 사항",
    indent(notes),
    "",
  ].join("\n");
  return {
    title,
    filenameBase: `${year}-${month}-msp-team-output`,
    markdown,
    text: markdown.replace(/^###\\s+/gm, "").replace(/\\*\\*/g, ""),
  };
}
