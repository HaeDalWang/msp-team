import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Holiday,
  type ScheduleEntry,
  type TeamMember,
  type User,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const types = ["출근", "휴가", "오전반차", "오후반차", "외근·출장"];
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const fixedHolidays: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};
const variableHolidays: Record<number, [string, string][]> = {
  2025: [
    ["01-28", "설날 연휴"],
    ["01-29", "설날"],
    ["01-30", "설날 연휴"],
    ["03-03", "삼일절 대체공휴일"],
    ["05-06", "어린이날·부처님오신날 대체공휴일"],
    ["10-05", "추석 연휴"],
    ["10-06", "추석"],
    ["10-07", "추석 연휴"],
    ["10-08", "추석 대체공휴일"],
  ],
  2026: [
    ["02-16", "설날 연휴"],
    ["02-17", "설날"],
    ["02-18", "설날 연휴"],
    ["03-02", "삼일절 대체공휴일"],
    ["05-24", "부처님오신날"],
    ["05-25", "부처님오신날 대체공휴일"],
    ["08-17", "광복절 대체공휴일"],
    ["09-24", "추석 연휴"],
    ["09-25", "추석"],
    ["09-26", "추석 연휴"],
    ["10-05", "개천절 대체공휴일"],
  ],
  2027: [
    ["02-06", "설날 연휴"],
    ["02-07", "설날"],
    ["02-08", "설날 연휴"],
    ["02-09", "설날 대체공휴일"],
    ["05-13", "부처님오신날"],
    ["08-16", "광복절 대체공휴일"],
    ["09-14", "추석 연휴"],
    ["09-15", "추석"],
    ["09-16", "추석 연휴"],
    ["10-04", "개천절 대체공휴일"],
    ["10-11", "한글날 대체공휴일"],
    ["12-27", "성탄절 대체공휴일"],
  ],
};
type Selected = {
  user: TeamMember;
  date: string;
  type: string;
  note: string;
  endDate: string;
  leaveHours?: number;
};
const todayMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
const changeMonth = (month: string, offset: number) =>
  new Date(
    Date.UTC(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1 + offset,
      1,
    ),
  )
    .toISOString()
    .slice(0, 7);
const daysFor = (month: string) =>
  Array.from(
    {
      length: new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      ).getUTCDate(),
    },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
const isWeekend = (date: string) =>
  [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
function holidaysFor(year: number): Map<string, string> {
  const entries: [string, string][] = [
    ...Object.entries(fixedHolidays).map(([key, name]): [string, string] => [
      `${year}-${key}`,
      name,
    ]),
    ...(variableHolidays[year] ?? []).map(([key, name]): [string, string] => [
      `${year}-${key}`,
      name,
    ]),
  ];
  return new Map(entries);
}
function defaultType(date: string, holidays: Map<string, string>) {
  return isWeekend(date) || holidays.has(date) ? "" : "출근";
}
function displayType(
  entry: ScheduleEntry | undefined,
  date: string,
  holidays: Map<string, string>,
) {
  if (entry?.leaveHours) return `대체휴가 ${entry.leaveHours}h`;
  return entry?.type || defaultType(date, holidays) || "—";
}

export function Schedule({
  user,
  onDirty,
}: {
  user: User;
  onDirty: (dirty: boolean) => void;
}) {
  const [month, setMonth] = useState(todayMonth);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [entries, setEntries] = useState<
    Record<string, Record<string, ScheduleEntry>>
  >({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [partFilter, setPartFilter] = useState("all");
  const [mobileDate, setMobileDate] = useState("");
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const official = useMemo(
    () => holidaysFor(Number(month.slice(0, 4))),
    [month],
  );
  const manual = useMemo(
    () => new Map(holidays.map((item) => [item.date, item.name])),
    [holidays],
  );
  const allHolidays = useMemo(
    () => new Map([...official, ...manual]),
    [official, manual],
  );
  const days = useMemo(() => daysFor(month), [month]);
  const visibleMembers = members.filter(
    (member) =>
      partFilter === "all" || (member.part ?? "무소속") === partFilter,
  );
  const editable =
    !!selected &&
    (selected.user.id === user.userId || ["admin", "lead"].includes(user.role));
  const saved = selected
    ? entries[selected.user.id]?.[selected.date]
    : undefined;
  const dirty =
    !!selected &&
    (selected.type !==
      (saved?.type ?? defaultType(selected.date, allHolidays)) ||
      selected.note !== (saved?.note ?? "") ||
      selected.endDate !== selected.date);
  useEffect(
    () => onDirty(dirty || busy || Boolean(holidayDate || holidayName)),
    [dirty, busy, holidayDate, holidayName, onDirty],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<{ users: TeamMember[] }>("/api/bootstrap", {
        signal: controller.signal,
      }),
      api<{ entries: Record<string, Record<string, ScheduleEntry>> }>(
        `/api/schedule?month=${month}`,
        { signal: controller.signal },
      ),
      api<{ holidays: Holiday[] }>("/api/holidays", {
        signal: controller.signal,
      }),
    ])
      .then(([bootstrap, schedule, holidayData]) => {
        setMembers(bootstrap.users);
        setEntries(schedule.entries);
        setHolidays(
          holidayData.holidays.filter((item) => item.date.startsWith(month)),
        );
        setSelected(null);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month, reload]);
  useEffect(() => {
    if (!mobileDate || !mobileDate.startsWith(month))
      setMobileDate(days[0] ?? "");
  }, [month, days, mobileDate]);
  function choose(member: TeamMember, date: string) {
    if (dirty && !confirm("저장하지 않은 일정 변경 내용을 버릴까요?")) return;
    const entry = entries[member.id]?.[date];
    setSelected({
      user: member,
      date,
      endDate: date,
      type: entry?.type ?? defaultType(date, allHolidays),
      note: entry?.note ?? "",
      leaveHours: entry?.leaveHours,
    });
  }
  async function saveSchedule(next?: Partial<Selected>) {
    const value = { ...selected, ...next } as Selected;
    if (!value || busy) return;
    if (
      value.endDate !== value.date &&
      !confirm(
        `${value.date}부터 ${value.endDate}까지 기존 일정과 메모를 덮어쓸까요?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          userId: value.user.id,
          date: value.date,
          endDate: value.endDate,
          type: value.type,
          note: value.note,
        }),
      });
      setSelected(null);
      setReload((n) => n + 1);
      toast.success("일정을 저장했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveHoliday() {
    if (!holidayDate || !holidayName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/holidays", {
        method: "POST",
        body: JSON.stringify({ date: holidayDate, name: holidayName.trim() }),
      });
      setHolidayDate("");
      setHolidayName("");
      setReload((n) => n + 1);
      toast.success("휴일을 저장했습니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeHoliday(date: string) {
    if (!confirm("이 휴일을 삭제할까요?") || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/holidays/${date}`, { method: "DELETE" });
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (error && !members.length)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            if (!dirty) setMonth(changeMonth(month, -1));
          }}
        >
          이전 달
        </Button>
        <strong className="tabular-nums">{month}</strong>
        <Button
          variant="outline"
          onClick={() => {
            if (!dirty) setMonth(changeMonth(month, 1));
          }}
        >
          다음 달
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (!dirty) setMonth(todayMonth());
          }}
        >
          오늘
        </Button>
        <select
          aria-label="파트 필터"
          className="ml-auto h-9 rounded-md border bg-background px-2"
          value={partFilter}
          onChange={(event) => setPartFilter(event.target.value)}
        >
          <option value="all">모든 파트</option>
          {[...new Set(members.map((member) => member.part ?? "무소속"))].map(
            (part) => (
              <option key={part}>{part}</option>
            ),
          )}
        </select>
        {["admin", "lead"].includes(user.role) && (
          <Button variant="outline" onClick={() => setHolidayOpen(true)}>
            휴일 관리
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        평일 기본값은 출근입니다. 승인된 대체휴가와 일정은 함께 표시되며, 휴가
        취소는 대체휴가 원장에서 처리합니다.
      </p>
      <div className="b-schedule-table hidden min-w-0 md:block">
        <Table
          className="table-fixed"
          style={{ width: `${19.5 + days.length * 5.25}rem` }}
        >
          <colgroup>
            <col className="b-schedule-part" />
            <col className="b-schedule-name" />
            <col className="b-schedule-hours" />
            {days.map((date) => <col key={date} className="b-schedule-day" />)}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="b-schedule-part">
                파트
              </TableHead>
              <TableHead className="b-schedule-name">
                이름
              </TableHead>
              <TableHead className="b-schedule-hours">
                근무 시간
              </TableHead>
              {days.map((date) => (
                <TableHead
                  key={date}
                  data-date={date}
                  className={
                    isWeekend(date) || allHolidays.has(date)
                      ? "text-destructive"
                      : undefined
                  }
                >
                  <strong>{date.slice(-2)}</strong>
                  <br />
                  <span>
                    {weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]}
                  </span>
                  <small className="block max-w-16 truncate">
                    {allHolidays.get(date)}
                  </small>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMembers.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="b-schedule-part">
                  {member.part ?? "무소속"}
                </TableCell>
                <TableCell className="b-schedule-name font-medium">
                  {member.name}
                </TableCell>
                <TableCell className="b-schedule-hours text-xs">
                  {member.workStart}–{member.workEnd}
                </TableCell>
                {days.map((date) => {
                  const entry = entries[member.id]?.[date];
                  return (
                    <TableCell key={date} className="p-1 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto min-h-9 whitespace-normal px-1 text-xs"
                        onClick={() => choose(member, date)}
                      >
                        {displayType(entry, date, allHolidays)}
                      </Button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        <label className="text-sm">
          날짜{" "}
          <Input
            type="date"
            value={mobileDate}
            onChange={(event) => setMobileDate(event.target.value)}
          />
        </label>
        {visibleMembers.map((member) => {
          const entry = entries[member.id]?.[mobileDate];
          return (
            <Button
              key={member.id}
              variant="outline"
              className="h-auto justify-between p-4"
              onClick={() => choose(member, mobileDate)}
            >
              <span>
                <strong>{member.name}</strong>{" "}
                <span className="text-muted-foreground">
                  {member.part ?? "무소속"}
                </span>
              </span>
              <span>{displayType(entry, mobileDate, allHolidays)}</span>
            </Button>
          );
        })}
      </div>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (
            !open &&
            (!dirty || confirm("저장하지 않은 일정 변경 내용을 버릴까요?"))
          )
            setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>일정 설정</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="flex flex-col gap-5 px-4">
              <p>
                <strong>{selected.user.name}</strong> · {selected.date}
              </p>
              {selected.leaveHours && (
                <Alert>
                  <AlertDescription>
                    승인된 대체휴가 {selected.leaveHours}시간입니다. 기존 일정은
                    유지되며, 휴가 취소는 대체휴가 원장에서 처리합니다.
                  </AlertDescription>
                </Alert>
              )}
              {editable ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {types.map((type) => (
                      <Button
                        key={type}
                        variant={
                          selected.type === type ? "secondary" : "outline"
                        }
                        disabled={busy}
                        onClick={() =>
                          setSelected((value) =>
                            value ? { ...value, type } : value,
                          )
                        }
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="schedule-end">
                        적용 종료일
                      </FieldLabel>
                      <Input
                        id="schedule-end"
                        type="date"
                        min={selected.date}
                        max={new Date(
                          Date.parse(`${selected.date}T00:00:00Z`) +
                            30 * 86400000,
                        )
                          .toISOString()
                          .slice(0, 10)}
                        value={selected.endDate}
                        disabled={busy}
                        onChange={(event) =>
                          setSelected((value) =>
                            value
                              ? { ...value, endDate: event.target.value }
                              : value,
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="schedule-type">일정 유형</FieldLabel>
                      <select
                        id="schedule-type"
                        className="h-9 rounded-md border bg-background px-2"
                        value={selected.type}
                        disabled={busy}
                        onChange={(event) =>
                          setSelected((value) =>
                            value
                              ? { ...value, type: event.target.value }
                              : value,
                          )
                        }
                      >
                        <option value="">기본 일정으로 되돌리기</option>
                        {types.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="schedule-note">사유</FieldLabel>
                      <Textarea
                        id="schedule-note"
                        maxLength={2000}
                        value={selected.note}
                        disabled={busy}
                        onChange={(event) =>
                          setSelected((value) =>
                            value
                              ? { ...value, note: event.target.value }
                              : value,
                          )
                        }
                      />
                    </Field>
                  </FieldGroup>
                  <Button disabled={busy} onClick={() => saveSchedule()}>
                    {busy ? "저장 중…" : "저장"}
                  </Button>
                </>
              ) : (
                <Alert>
                  <AlertDescription>
                    본인 또는 관리자·팀장만 일정을 수정할 수 있습니다.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={holidayOpen} onOpenChange={setHolidayOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>휴일 관리</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="holiday-date">날짜</FieldLabel>
                <Input
                  id="holiday-date"
                  type="date"
                  value={holidayDate}
                  disabled={busy}
                  onChange={(event) => setHolidayDate(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="holiday-name">이름</FieldLabel>
                <Input
                  id="holiday-name"
                  maxLength={100}
                  value={holidayName}
                  disabled={busy}
                  onChange={(event) => setHolidayName(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Button
              disabled={busy || !holidayDate || !holidayName.trim()}
              onClick={saveHoliday}
            >
              휴일 추가
            </Button>
            <div className="flex flex-col gap-2">
              {holidays.length ? (
                holidays.map((holiday) => (
                  <div
                    className="flex items-center gap-2 border-b py-2"
                    key={holiday.date}
                  >
                    <span>
                      {holiday.date} · {holiday.name}
                    </span>
                    <Button
                      className="ml-auto"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => removeHoliday(holiday.date)}
                    >
                      삭제
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">
                  이번 달에 등록된 수동 휴일이 없습니다.
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
