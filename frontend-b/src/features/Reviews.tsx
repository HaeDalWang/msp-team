import { useEffect, useMemo, useState } from "react";
import { api, type Comment, type Review, type User } from "@/lib/api";
import { moveWeek } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { buildMonthlyTeamOutput, weeksInMonth } from "@/lib/monthlyOutput";

const labels = {
  missing: "미작성",
  draft: "작성 중",
  submitted: "제출 완료",
  reviewed: "검토 완료",
  recheck: "재검토 필요",
};
const fields = [
  ["workHighlights", "주요 업무 현황"],
  ["actionItems", "주요 계획 / Action Item"],
  ["topsProjects", "프로젝트/과제 현황(TOPS)"],
  ["otherNotes", "기타 사항"],
] as const;
const number = (value: number) => value.toLocaleString("ko-KR");
function initialPerson() {
  try {
    const id = sessionStorage.getItem("msp-b-review-person") ?? "";
    sessionStorage.removeItem("msp-b-review-person");
    return id;
  } catch { return "" }
}
function Status({ status }: { status: Review["status"] }) {
  return (
    <Badge
      data-status={status}
      variant={
        status === "reviewed"
          ? "default"
          : status === "missing"
            ? "outline"
            : "secondary"
      }
    >
      {labels[status]}
    </Badge>
  );
}

export function Reviews({
  week,
  user,
  dashboard,
  onDirty,
}: {
  week: string;
  user: User;
  dashboard?: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [entries, setEntries] = useState<Review[]>([]);
  const [previous, setPrevious] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState(initialPerson);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("single");
  const [filter, setFilter] = useState("all");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputError, setOutputError] = useState("");
  const [output, setOutput] = useState<ReturnType<
    typeof buildMonthlyTeamOutput
  > | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<{ entries: Review[] }>(`/api/reviews?weekEnd=${week}`, {
        signal: controller.signal,
      }),
      api<{ entries: Review[] }>(`/api/reviews?weekEnd=${moveWeek(week, -1)}`, {
        signal: controller.signal,
      }),
    ])
      .then(([current, prior]) => {
        setEntries(current.entries);
        setPrevious(prior.entries);
        setSelectedId((id) =>
          current.entries.some((e) => e.id === id)
            ? id
            : (current.entries[0]?.id ?? ""),
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [week, reload]);
  const people = useMemo(
    () =>
      entries.filter(
        (e) =>
          `${e.name} ${e.part ?? ""} ${e.workHighlights} ${e.actionItems}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()) &&
          (filter === "all" || e.status === filter),
      ),
    [entries, query, filter],
  );
  const selected = people.find((e) => e.id === selectedId) ?? people[0];
  const commentKey = `${week}:${selected?.id}`;
  const draft = commentDrafts[commentKey] ?? "";
  useEffect(
    () =>
      onDirty(
        Object.values(commentDrafts).some((value) => !!value.trim()) ||
          commentBusy,
      ),
    [commentDrafts, commentBusy, onDirty],
  );
  useEffect(() => {
    if (!commentsOpen || !selected?.reviewId) {
      setComments([]);
      return;
    }
    let active = true;
    setCommentError("");
    api<{ comments: Comment[] }>(`/api/reviews/${selected.reviewId}/comments`)
      .then((result) => {
        if (active) setComments(result.comments);
      })
      .catch((e) => {
        if (active) setCommentError(e.message);
      });
    return () => {
      active = false;
    };
  }, [commentsOpen, selected?.reviewId]);
  async function addComment() {
    if (!selected?.reviewId || !draft.trim() || commentBusy) return;
    setCommentBusy(true);
    setCommentError("");
    try {
      const created = await api<Comment>(
        `/api/reviews/${selected.reviewId}/comments`,
        { method: "POST", body: JSON.stringify({ body: draft }) },
      );
      setComments((list) => [...list, created]);
      setCommentDrafts((old) => ({ ...old, [commentKey]: "" }));
      toast.success("코멘트를 등록했습니다.");
    } catch (e) {
      setCommentError((e as Error).message);
    } finally {
      setCommentBusy(false);
    }
  }
  async function complete() {
    if (!selected?.reviewId || commentBusy) return;
    setCommentBusy(true);
    setCommentError("");
    try {
      await api(`/api/reviews/${selected.reviewId}/complete`, {
        method: "POST",
        body: JSON.stringify({ version: selected.version }),
      });
      toast.success("검토 완료했습니다.");
      setReload((x) => x + 1);
    } catch (e) {
      setCommentError((e as Error).message);
    } finally {
      setCommentBusy(false);
    }
  }
  async function openOutput() {
    if (outputBusy) return;
    setOutputBusy(true);
    setOutputError("");
    try {
      const snapshots = await Promise.all(
        weeksInMonth(week).map(async (reviewEnd) => {
          const result = await api<{ entries: Review[] }>(
            `/api/reviews?weekEnd=${reviewEnd}`,
          );
          const submitted = result.entries.filter((entry) =>
            ["submitted", "reviewed"].includes(entry.status),
          );
          return {
            reviewEnd,
            entries: submitted,
            totalTickets: submitted.reduce(
              (sum, entry) => sum + entry.tickets[2],
              0,
            ),
          };
        }),
      );
      setOutput(buildMonthlyTeamOutput(week, snapshots));
      setOutputOpen(true);
    } catch (e) {
      setOutputError((e as Error).message);
    } finally {
      setOutputBusy(false);
    }
  }
  function downloadOutput(kind: "markdown" | "text") {
    if (!output) return;
    const content = kind === "markdown" ? output.markdown : output.text;
    const blob = new Blob([content], {
      type: kind === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${output.filenameBase}.${kind === "markdown" ? "md" : "txt"}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }
  if (loading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}{" "}
          <Button variant="outline" onClick={() => setReload((x) => x + 1)}>
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (dashboard) {
    const totals = entries.reduce(
      (sum, e) => sum.map((n, i) => n + e.tickets[i]),
      [0, 0, 0],
    );
    const submitted = entries.filter((e) =>
      ["submitted", "reviewed"].includes(e.status),
    ).length;
    const shown =
      filter === "all" ? entries : entries.filter((e) => e.status === filter);
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          {week} 시작 주 · 참여 {entries.length}명 · 제출 {submitted}명 · 검토{" "}
          {entries.filter((e) => e.status === "reviewed").length}명
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {["신규", "진행 중", "종료"].map((label, i) => (
            <div key={label} className="b-metric-card rounded-xl border p-4">
              <div className="text-sm text-muted-foreground">{label} 티켓</div>
              <strong className="text-2xl tabular-nums">
                {number(totals[i])}
              </strong>
            </div>
          ))}
          <div className="b-metric-card rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">회고 제출</div>
            <strong className="text-2xl tabular-nums">
              {submitted} / {entries.length}
            </strong>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "all" ? "secondary" : "outline"}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체
          </Button>
          <Button
            variant={filter === "missing" ? "secondary" : "outline"}
            aria-pressed={filter === "missing"}
            onClick={() => setFilter("missing")}
          >
            미작성
          </Button>
          {["admin", "lead"].includes(user.role) && (
            <Button
              variant={filter === "submitted" ? "secondary" : "outline"}
              aria-pressed={filter === "submitted"}
              onClick={() => setFilter("submitted")}
            >
              미검토
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {["파트", "이름", "상태", "신규", "진행 중", "종료", ""].map(
                  (x) => (
                    <TableHead key={x}>{x}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.part ?? "무소속"}</TableCell>
                  <TableCell>{e.name}</TableCell>
                  <TableCell>
                    <Status status={e.status} />
                  </TableCell>
                  {e.tickets.map((n, i) => (
                    <TableCell className="tabular-nums" key={i}>
                      {number(n)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      variant="link"
                      onClick={() => {
                        location.hash = "review";
                        sessionStorage.setItem("msp-b-review-person", e.id);
                      }}
                    >
                      회고 보기
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }
  const opened = mode === "all" ? people : selected ? [selected] : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="이번 주 회고 검색"
          placeholder="이번 주 회고 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v)}
          variant="outline"
        >
          <ToggleGroupItem value="single">한 명씩</ToggleGroupItem>
          <ToggleGroupItem value="all">전체 보기</ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={outputBusy}
          onClick={openOutput}
        >
          <FileDown />
          {outputBusy ? "월간 Output 집계 중…" : "월간 Output"}
        </Button>
      </div>
      {outputError && (
        <Alert variant="destructive">
          <AlertDescription>{outputError}</AlertDescription>
        </Alert>
      )}
      {people.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-muted-foreground">
          {entries.length
            ? "검색 결과가 없습니다. 검색어를 바꿔 보세요."
            : "이번 주 회고 대상자가 없습니다."}
        </p>
      ) : (
        <div className="review-columns">
          <aside
            className="review-people rounded-xl border p-2"
            aria-label="엔지니어 목록"
          >
            <p className="px-2 py-2 text-sm font-medium">
              엔지니어 · {people.length}명
            </p>
            {people.map((e) => (
              <Button
                key={e.id}
                variant={selected?.id === e.id ? "secondary" : "ghost"}
                aria-pressed={selected?.id === e.id}
                className="w-full justify-start"
                onClick={() => {
                  setSelectedId(e.id);
                  if (mode === "all")
                    document
                      .getElementById(`review-${e.id}`)
                      ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {e.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {labels[e.status]}
                </span>
              </Button>
            ))}
          </aside>
          <div className="min-w-0 flex flex-col gap-5">
            {mode === "single" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={people.indexOf(selected) <= 0}
                  onClick={() =>
                    setSelectedId(people[people.indexOf(selected) - 1].id)
                  }
                >
                  이전
                </Button>
                <select
                  aria-label="발표자 선택"
                  className="h-9 min-w-0 rounded-md border bg-background px-2"
                  value={selected?.id}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {people.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name} · {e.part ?? "무소속"}
                    </option>
                  ))}
                </select>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {people.indexOf(selected) + 1} / {people.length}
                </span>
                <Button
                  variant="outline"
                  disabled={people.indexOf(selected) >= people.length - 1}
                  onClick={() =>
                    setSelectedId(people[people.indexOf(selected) + 1].id)
                  }
                >
                  다음
                </Button>
              </div>
            )}
            {opened.map((e) => {
              const prev = previous.find((p) => p.id === e.id && p.reviewId);
              return (
                <article
                  id={`review-${e.id}`}
                  key={e.id}
                  className="b-review-entry min-w-0 flex flex-col gap-4 rounded-xl border p-5 md:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{e.name}</h2>
                    <span className="text-sm text-muted-foreground">
                      {e.part ?? "무소속"}
                    </span>
                    <Status status={e.status} />
                    <Button
                      variant="outline"
                      className="ml-auto"
                      onClick={() => {
                        setSelectedId(e.id);
                        setCommentsOpen(true);
                      }}
                    >
                      코멘트 보기
                    </Button>
                  </div>
                  {e.meetingLeave && (
                    <Alert>
                      <AlertDescription>
                        회고일 {week}: {e.meetingLeave}
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="b-ticket-strip flex flex-wrap gap-x-2 gap-y-2 text-sm tabular-nums">
                    {["신규", "진행 중", "종료"].map((label, i) => (
                      <span key={label}>
                        {label} <strong>{number(e.tickets[i])}</strong>{" "}
                        <span className="text-muted-foreground">
                          {prev
                            ? `(${e.tickets[i] - prev.tickets[i] >= 0 ? "+" : ""}${number(e.tickets[i] - prev.tickets[i])})`
                            : "(전주 자료 없음)"}
                        </span>
                      </span>
                    ))}
                  </div>
                  {prev && (
                    <details className="text-sm">
                      <summary className="cursor-pointer">지난주 계획</summary>
                      <p className="mt-2 whitespace-pre-wrap">
                        {prev.actionItems || "등록된 계획 없음"}
                      </p>
                    </details>
                  )}
                  {fields.map(([key, label]) => (
                    <section key={key} className="min-w-0">
                      <h3 className="mb-1 font-medium">{label}</h3>
                      <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground/85">
                        {e[key] || "작성된 내용 없음"}
                      </p>
                    </section>
                  ))}
                </article>
              );
            })}
          </div>
        </div>
      )}
      <Sheet
        open={commentsOpen}
        onOpenChange={(open) => {
          if (
            !open &&
            draft.trim() &&
            !confirm("저장하지 않은 코멘트를 유지하고 닫을까요?")
          )
            return;
          setCommentsOpen(open);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected?.name ?? "회고"} 코멘트</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            {commentError && (
              <Alert variant="destructive">
                <AlertDescription>{commentError}</AlertDescription>
              </Alert>
            )}
            {!selected?.reviewId ? (
              <p>아직 작성된 회고가 없습니다.</p>
            ) : (
              <>
                {comments.length ? (
                  comments.map((c) => (
                    <div className="border-b py-2" key={c.id}>
                      <div className="text-sm font-medium">
                        {c.authorName}{" "}
                        <span className="text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">
                        {c.body}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    등록된 코멘트가 없습니다.
                  </p>
                )}
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="review-comment">
                      코멘트 작성
                    </FieldLabel>
                    <Textarea
                      id="review-comment"
                      maxLength={5000}
                      value={draft}
                      onChange={(event) =>
                        setCommentDrafts((old) => ({
                          ...old,
                          [commentKey]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </FieldGroup>
                <Button
                  disabled={commentBusy || !draft.trim()}
                  onClick={addComment}
                >
                  코멘트 등록
                </Button>
                {["admin", "lead"].includes(user.role) &&
                  selected?.status === "submitted" && (
                    <Button
                      variant="outline"
                      disabled={commentBusy}
                      onClick={complete}
                    >
                      검토 완료
                    </Button>
                  )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={outputOpen} onOpenChange={setOutputOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{output?.title ?? "월간 Output"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-4">
            <p className="text-sm text-muted-foreground">
              선택한 달에 시작하는 주의 제출·검토 완료 회고를 집계합니다. 티켓 처리 건수는 종료 티켓만 합산합니다.
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-sm whitespace-pre-wrap">
              {output?.markdown}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadOutput("markdown")}>
                Markdown 다운로드
              </Button>
              <Button variant="outline" onClick={() => downloadOutput("text")}>
                TXT 다운로드
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
