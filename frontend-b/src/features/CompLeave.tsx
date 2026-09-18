import { useEffect, useState } from "react";
import {
  api,
  type LeaveRecord,
  type OvertimeRecord,
  type TeamMember,
  type TimeSummary,
  type User,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

const overtimeTypes = ["기술지원", "작업", "장애대응", "점검"];
const labels = {
  pending: "검토 대기",
  approved: "승인",
  rejected: "반려",
  cancelled: "승인 취소",
};
type OvertimeForm = {
  date: string;
  type: string;
  customer: string;
  startTime: string;
  endTime: string;
  detail: string;
  evidence: string;
};
type LeaveForm = { date: string; hours: string; reason: string };
const blankOvertime = (): OvertimeForm => ({
  date: "",
  type: "기술지원",
  customer: "",
  startTime: "",
  endTime: "",
  detail: "",
  evidence: "",
});
const blankLeave = (): LeaveForm => ({ date: "", hours: "", reason: "" });
const hours = (value: number | undefined) =>
  value === undefined ? "미조회" : `${value}시간`;
function calculatedHours(start: string, end: string) {
  if (!/^\d\d:\d\d$/.test(start) || !/^\d\d:\d\d$/.test(end)) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return (
    ((endHour * 60 + endMinute - startHour * 60 - startMinute + 1440) % 1440) /
    60
  );
}
function Status({
  value,
}: {
  value: OvertimeRecord["status"] | LeaveRecord["status"];
}) {
  return (
    <Badge
      variant={
        value === "approved"
          ? "default"
          : value === "pending"
            ? "secondary"
            : "outline"
      }
    >
      {labels[value]}
    </Badge>
  );
}

export function CompLeave({
  user,
  onDirty,
}: {
  user: User;
  onDirty: (dirty: boolean) => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [summary, setSummary] = useState<Record<string, TimeSummary>>({});
  const [selectedId, setSelectedId] = useState(user.userId);
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [overtime, setOvertime] = useState<OvertimeForm>(blankOvertime);
  const [leave, setLeave] = useState<LeaveForm>(blankLeave);
  const [cancel, setCancel] = useState<{
    kind: "overtime" | "leave";
    id: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const editable = selectedId === user.userId;
  const mine = summary[user.userId];
  const selectedSummary = summary[selectedId];
  const available = Math.max(
    0,
    (mine?.balanceHours ?? 0) - (mine?.pendingLeaveHours ?? 0),
  );
  const dirty =
    Object.entries(overtime).some(
      ([key, value]) => key !== "type" && Boolean(value),
    ) ||
    Object.values(leave).some(Boolean) ||
    Boolean(cancelReason);
  useEffect(() => onDirty(dirty || busy), [dirty, busy, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<{ users: TeamMember[] }>("/api/bootstrap", {
        signal: controller.signal,
      }),
      api<{ users: TimeSummary[] }>("/api/overtime/summary", {
        signal: controller.signal,
      }),
    ])
      .then(([bootstrap, summaryData]) => {
        setMembers(bootstrap.users);
        setSummary(
          Object.fromEntries(
            summaryData.users.map((item) => [item.userId, item]),
          ),
        );
        if (!bootstrap.users.some((member) => member.id === selectedId))
          setSelectedId(user.userId);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, selectedId, user.userId]);
  useEffect(() => {
    if (!members.length) return;
    const controller = new AbortController();
    setRecords([]);
    setLeaves([]);
    api<{ records: OvertimeRecord[]; leaves: LeaveRecord[] }>(
      `/api/overtime?userId=${selectedId}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setRecords(data.records);
        setLeaves(data.leaves);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [members.length, selectedId, reload]);
  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setReload((n) => n + 1);
      toast.success(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function closeOvertime(open: boolean) {
    if (!open && dirty && !confirm("저장하지 않은 초과근무 입력을 버릴까요?"))
      return;
    if (!open) {
      setOvertimeOpen(false);
      setOvertime(blankOvertime());
    } else setOvertimeOpen(true);
  }
  function closeLeave(open: boolean) {
    if (!open && dirty && !confirm("저장하지 않은 휴가 신청을 버릴까요?"))
      return;
    if (!open) {
      setLeaveOpen(false);
      setLeave(blankLeave());
    } else setLeaveOpen(true);
  }
  async function submitOvertime() {
    if (
      !editable ||
      calculatedHours(overtime.startTime, overtime.endTime) <= 0
    ) {
      setError("시작과 종료 시간을 다르게 입력하세요.");
      return;
    }
    await run(async () => {
      await api("/api/overtime", {
        method: "POST",
        body: JSON.stringify(overtime),
      });
      setOvertime(blankOvertime());
      setOvertimeOpen(false);
    }, "초과근무를 등록했습니다.");
  }
  async function submitLeave() {
    await run(async () => {
      await api("/api/leave", {
        method: "POST",
        body: JSON.stringify({ ...leave, hours: Number(leave.hours) }),
      });
      setLeave(blankLeave());
      setLeaveOpen(false);
    }, "대체휴가 사용을 신청했습니다.");
  }
  async function recordAction(
    kind: "overtime" | "leave",
    id: string,
    action: "approve" | "reject" | "delete",
  ) {
    await run(
      () =>
        api(`/api/${kind}/${id}${action === "delete" ? "" : `/${action}`}`, {
          method: action === "delete" ? "DELETE" : "POST",
        }),
      action === "approve"
        ? "승인했습니다."
        : action === "reject"
          ? "반려했습니다."
          : "기록을 삭제했습니다.",
    );
  }
  async function cancelRecord() {
    if (!cancel || !cancelReason.trim()) return;
    await run(async () => {
      await api(`/api/${cancel.kind}/${cancel.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setCancel(null);
      setCancelReason("");
    }, "승인을 취소했습니다.");
  }
  const canApprove = ["admin", "lead"].includes(user.role);
  const selectedName =
    members.find((member) => member.id === selectedId)?.name ?? "팀원";
  if (loading && !members.length)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">내 신청 가능 시간</p>
          <strong className="text-2xl tabular-nums">{hours(available)}</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            잔여 {hours(mine?.balanceHours)} − 사용 승인 대기{" "}
            {hours(mine?.pendingLeaveHours)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">승인된 적립</p>
          <strong className="text-2xl tabular-nums">
            {hours(mine?.accruedHours)}
          </strong>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">승인된 사용</p>
          <strong className="text-2xl tabular-nums">
            {hours(mine?.usedHours)}
          </strong>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">적립 승인 대기</p>
          <strong className="text-2xl tabular-nums">
            {hours(mine?.pendingHours)}
          </strong>
          <p className="mt-1 text-xs text-muted-foreground">
            대기 적립은 신청 가능 시간에 포함되지 않습니다.
          </p>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOvertimeOpen(true)}>초과근무 등록</Button>
        <Button variant="outline" onClick={() => setLeaveOpen(true)}>
          대체휴가 신청
        </Button>
        {canApprove && (
          <select
            aria-label="팀원 원장 선택"
            className="ml-auto h-9 rounded-md border bg-background px-2"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {members.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name} · {member.part ?? "무소속"}
              </option>
            ))}
          </select>
        )}
      </div>
      {canApprove && selectedSummary && (
        <p className="text-sm text-muted-foreground">
          {selectedName}: 잔여 {hours(selectedSummary.balanceHours)} · 적립 대기{" "}
          {hours(selectedSummary.pendingHours)} · 사용 대기{" "}
          {hours(selectedSummary.pendingLeaveHours)}
        </p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {editable ? "내" : selectedName + "의"} 초과근무 내역
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "업무 일자",
                  "유형",
                  "고객사/업무",
                  "시간",
                  "업무 내용",
                  "상태",
                  "처리",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length ? (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.date}</TableCell>
                    <TableCell>{record.type}</TableCell>
                    <TableCell>
                      {record.customer}
                      <small className="block">
                        {record.startTime}–{record.endTime}
                      </small>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {hours(record.hours)}
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-pre-wrap">
                      {record.detail}
                    </TableCell>
                    <TableCell>
                      <Status value={record.status} />
                      {record.cancellationReason && (
                        <small className="mt-1 block">
                          취소 사유: {record.cancellationReason}
                        </small>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {record.status === "pending" && canApprove && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              recordAction("overtime", record.id, "approve")
                            }
                          >
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              recordAction("overtime", record.id, "reject")
                            }
                          >
                            반려
                          </Button>
                        </>
                      )}
                      {record.status === "approved" && canApprove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCancel({ kind: "overtime", id: record.id });
                            setCancelReason("");
                          }}
                        >
                          승인 취소
                        </Button>
                      )}
                      {editable &&
                        ["pending", "rejected"].includes(record.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("이 신청을 삭제할까요?"))
                                recordAction("overtime", record.id, "delete");
                            }}
                          >
                            삭제
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    등록된 초과근무가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {editable ? "내" : selectedName + "의"} 대체휴가 사용 내역
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {["사용 날짜", "시간", "사유", "상태", "처리"].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaves.length ? (
                leaves.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.date}</TableCell>
                    <TableCell>{hours(record.hours)}</TableCell>
                    <TableCell>{record.reason}</TableCell>
                    <TableCell>
                      <Status value={record.status} />
                      {record.cancellationReason && (
                        <small className="mt-1 block">
                          취소 사유: {record.cancellationReason}
                        </small>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {record.status === "pending" && canApprove && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              recordAction("leave", record.id, "approve")
                            }
                          >
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              recordAction("leave", record.id, "reject")
                            }
                          >
                            반려
                          </Button>
                        </>
                      )}
                      {record.status === "approved" && canApprove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCancel({ kind: "leave", id: record.id });
                            setCancelReason("");
                          }}
                        >
                          승인 취소
                        </Button>
                      )}
                      {editable &&
                        ["pending", "rejected"].includes(record.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("이 신청을 삭제할까요?"))
                                recordAction("leave", record.id, "delete");
                            }}
                          >
                            삭제
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    등록된 사용 신청이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      <Sheet open={overtimeOpen} onOpenChange={closeOvertime}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>초과근무 등록</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">
            <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ot-date">업무 일자</FieldLabel>
                <Input
                  id="ot-date"
                  type="date"
                  value={overtime.date}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, date: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ot-type">업무 유형</FieldLabel>
                <select
                  id="ot-type"
                  className="h-9 rounded-md border bg-background px-2"
                  value={overtime.type}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, type: event.target.value })
                  }
                >
                  {overtimeTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="ot-customer">
                  고객사 또는 업무명
                </FieldLabel>
                <Input
                  id="ot-customer"
                  maxLength={200}
                  value={overtime.customer}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, customer: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ot-start">시작 시간</FieldLabel>
                <Input
                  id="ot-start"
                  type="time"
                  step={1800}
                  value={overtime.startTime}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, startTime: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ot-end">종료 시간</FieldLabel>
                <Input
                  id="ot-end"
                  type="time"
                  step={1800}
                  value={overtime.endTime}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, endTime: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>산정 예상</FieldLabel>
                <p className="h-9 pt-2 tabular-nums">
                  {calculatedHours(overtime.startTime, overtime.endTime)}시간
                </p>
              </Field>
            </FieldGroup>
            <p className="text-sm text-muted-foreground">
              종료 시간이 시작보다 이르면 다음 날 종료로 계산합니다. 최종 시간은
              서버에서 산정합니다.
            </p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ot-detail">업무 내용</FieldLabel>
                <Textarea
                  id="ot-detail"
                  maxLength={4000}
                  value={overtime.detail}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, detail: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ot-evidence">관련 티켓·링크</FieldLabel>
                <Input
                  id="ot-evidence"
                  maxLength={2000}
                  value={overtime.evidence}
                  disabled={busy}
                  onChange={(event) =>
                    setOvertime({ ...overtime, evidence: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <Button
              disabled={
                busy ||
                !overtime.date ||
                !overtime.customer.trim() ||
                !overtime.detail.trim() ||
                calculatedHours(overtime.startTime, overtime.endTime) <= 0
              }
              onClick={submitOvertime}
            >
              {busy ? "등록 중…" : "초과근무 등록"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={leaveOpen} onOpenChange={closeLeave}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>대체휴가 사용 신청</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">
            <Alert>
              <AlertDescription>
                신청 가능 시간 {hours(available)} · 승인 대기 중인 사용 신청은
                잔여 시간에서 제외됩니다.
              </AlertDescription>
            </Alert>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="leave-date">사용 날짜</FieldLabel>
                <Input
                  id="leave-date"
                  type="date"
                  value={leave.date}
                  disabled={busy}
                  onChange={(event) =>
                    setLeave({ ...leave, date: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="leave-hours">사용 시간</FieldLabel>
                <select
                  id="leave-hours"
                  className="h-9 rounded-md border bg-background px-2"
                  value={leave.hours}
                  disabled={busy}
                  onChange={(event) =>
                    setLeave({ ...leave, hours: event.target.value })
                  }
                >
                  <option value="">선택</option>
                  <option value="4">4시간 (반일)</option>
                  <option value="8">8시간 (하루)</option>
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="leave-reason">사유</FieldLabel>
                <Textarea
                  id="leave-reason"
                  maxLength={2000}
                  value={leave.reason}
                  disabled={busy}
                  onChange={(event) =>
                    setLeave({ ...leave, reason: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <Button
              disabled={
                busy || !leave.date || !leave.hours || !leave.reason.trim()
              }
              onClick={submitLeave}
            >
              {busy ? "신청 중…" : "사용 신청"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!cancel}
        onOpenChange={(open) => {
          if (!open) {
            setCancel(null);
            setCancelReason("");
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>승인 취소</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">
            <p>승인된 기록은 원장에 취소 이력으로 남습니다.</p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cancel-reason">취소 사유</FieldLabel>
                <Textarea
                  id="cancel-reason"
                  maxLength={2000}
                  value={cancelReason}
                  disabled={busy}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Button
              variant="destructive"
              disabled={busy || !cancelReason.trim()}
              onClick={cancelRecord}
            >
              승인 취소
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
