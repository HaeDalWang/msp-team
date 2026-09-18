import { useEffect, useState } from "react";
import { api, type Review, type User } from "@/lib/api";
import { moveWeek } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Draft = Pick<
  Review,
  "workHighlights" | "actionItems" | "topsProjects" | "otherNotes"
> & { tickets: [number, number, number] };
const fields = [
  ["workHighlights", "주요 업무 현황"],
  ["actionItems", "주요 계획 / Action Item"],
  ["topsProjects", "프로젝트/과제 현황(TOPS)"],
  ["otherNotes", "기타 사항"],
] as const;
const empty: Draft = {
  workHighlights: "",
  actionItems: "",
  topsProjects: "",
  otherNotes: "",
  tickets: [0, 0, 0],
};
const ticketCount = (value: number) => Math.min(1024, Math.max(0, value));
function editorMode(): "list" | "grid" {
  try {
    return localStorage.getItem("msp-b-editor-mode") === "grid"
      ? "grid"
      : "list";
  } catch {
    return "list";
  }
}
function saveEditorMode(value: "list" | "grid") {
  try {
    localStorage.setItem("msp-b-editor-mode", value);
  } catch {
    /* Storage may be unavailable. */
  }
}
const fromReview = (entry?: Review): Draft =>
  entry
    ? {
        workHighlights: entry.workHighlights,
        actionItems: entry.actionItems,
        topsProjects: entry.topsProjects,
        otherNotes: entry.otherNotes,
        tickets: entry.tickets.map(ticketCount) as Draft["tickets"],
      }
    : empty;
export function ReviewEdit({
  week,
  user,
  onDirty,
}: {
  week: string;
  user: User;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(empty);
  const [saved, setSaved] = useState<Draft>(empty);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("missing");
  const [layout, setLayout] = useState<"list" | "grid">(editorMode);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => onDirty(dirty || busy), [dirty, busy, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ entries: Review[] }>(`/api/reviews?weekEnd=${week}&personal=true`, {
      signal: controller.signal,
    })
      .then((result) => {
        const entry = result.entries.find((e) => e.id === user.userId);
        const next = fromReview(entry);
        setDraft(next);
        setSaved(next);
        setVersion(entry?.version ?? 0);
        setStatus(entry?.status ?? "missing");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [week, user.userId, reload]);
  async function save(nextStatus: "draft" | "submitted") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ version: number; status: string }>(
        "/api/reviews",
        {
          method: "PUT",
          body: JSON.stringify({
            weekEnd: week,
            version,
            status: nextStatus,
            workHighlights: draft.workHighlights,
            actionItems: draft.actionItems,
            topsProjects: draft.topsProjects,
            otherNotes: draft.otherNotes,
            ticketsNew: draft.tickets[0],
            ticketsInProgress: draft.tickets[1],
            ticketsDone: draft.tickets[2],
          }),
        },
      );
      setVersion(result.version);
      setStatus(result.status);
      const persisted =
        nextStatus === "submitted"
          ? {
              ...draft,
              workHighlights: draft.workHighlights.trim() || "특이사항 없음",
              actionItems: draft.actionItems.trim() || "특이사항 없음",
              topsProjects: draft.topsProjects.trim() || "특이사항 없음",
              otherNotes: draft.otherNotes.trim() || "특이사항 없음",
            }
          : draft;
      setDraft(persisted);
      setSaved(persisted);
      toast.success(
        nextStatus === "draft" ? "임시 저장했습니다." : "회고를 제출했습니다.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadPrevious() {
    if (dirty && !confirm("현재 입력을 지난주 내용으로 바꿀까요?")) return;
    try {
      const result = await api<{ entries: Review[] }>(
        `/api/reviews?weekEnd=${moveWeek(week, -1)}&personal=true`,
      );
      const entry = result.entries.find((e) => e.id === user.userId);
      if (!entry?.reviewId) {
        setError("지난주에 저장된 회고가 없습니다.");
        return;
      }
      setDraft((old) => ({
        ...old,
        workHighlights: entry.workHighlights,
        actionItems: entry.actionItems,
        topsProjects: entry.topsProjects,
        otherNotes: entry.otherNotes,
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background py-3">
        <strong>{user.name}</strong>
        <span className="text-sm text-muted-foreground">
          {week} 시작 주 ·{" "}
          {status === "submitted"
            ? "제출 완료"
            : status === "draft"
              ? "작성 중"
              : status === "reviewed"
                ? "검토 완료"
                : "미작성"}
        </span>
        <span className="ml-auto text-sm" role="status">
          {busy
            ? "저장 중…"
            : dirty
              ? "저장하지 않은 변경 사항"
              : status === "missing"
                ? "아직 저장한 회고 없음"
                : "서버에 저장된 내용"}
        </span>
        <Button variant="outline" disabled={busy} onClick={loadPrevious}>
          지난주 불러오기
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => save("draft")}>
          임시 저장
        </Button>
        <Button disabled={busy} onClick={() => save("submitted")}>
          제출
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {["신규", "진행 중", "종료"].map((label, i) => (
          <Field key={label}>
            <FieldLabel htmlFor={`ticket-${i}`}>{label} 티켓</FieldLabel>
            <Input
              id={`ticket-${i}`}
              aria-describedby={`ticket-${i}-hint`}
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]*"
              placeholder="0"
              value={draft.tickets[i] || ""}
              onChange={(event) => {
                const digits = event.target.value
                  .replace(/\D/g, "")
                  .replace(/^0+(?=\d)/, "");
                setDraft((old) => ({
                  ...old,
                  tickets: old.tickets.map((count, index) =>
                    index === i ? ticketCount(Number(digits || 0)) : count,
                  ) as Draft["tickets"],
                }));
              }}
            />
            <small id={`ticket-${i}-hint`} className="text-muted-foreground">
              0–1,024건
            </small>
          </Field>
        ))}
      </FieldGroup>
      <div className="flex items-center gap-2">
        <Button
          variant={layout === "list" ? "secondary" : "outline"}
          onClick={() => {
            setLayout("list");
            saveEditorMode("list");
          }}
        >
          세로로 쓰기
        </Button>
        <Button
          variant={layout === "grid" ? "secondary" : "outline"}
          onClick={() => {
            setLayout("grid");
            saveEditorMode("grid");
          }}
        >
          나란히 쓰기
        </Button>
        <span className="text-sm text-muted-foreground">
          빈 항목은 제출 시 ‘특이사항 없음’으로 저장됩니다.
        </span>
      </div>
      <FieldGroup
        className={
          layout === "grid"
            ? "grid grid-cols-1 gap-5 lg:grid-cols-2"
            : "flex flex-col gap-5"
        }
      >
        {fields.map(([key, label]) => (
          <Field key={key}>
            <FieldLabel htmlFor={key}>{label}</FieldLabel>
            <Textarea
              id={key}
              className="min-h-36 resize-y"
              value={draft[key]}
              onChange={(e) =>
                setDraft((old) => ({ ...old, [key]: e.target.value }))
              }
            />
          </Field>
        ))}
      </FieldGroup>
    </div>
  );
}
