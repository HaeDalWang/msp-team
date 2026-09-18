import { useEffect, useMemo, useState } from "react";
import { api, type Customer, type Owner, type User } from "@/lib/api";
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

type Row = Customer & { ownerId: string; owner: string; part: string | null };
type Form = {
  name: string;
  userId: string;
  since: string;
  tier: string;
  mcr: boolean;
  keyAccount: boolean;
  note: string;
};
const blank: Form = {
  name: "",
  userId: "",
  since: "",
  tier: "Standard",
  mcr: false,
  keyAccount: false,
  note: "",
};
const toForm = (row: Row): Form => ({
  name: row.name,
  userId: row.ownerId,
  since: row.since ?? "",
  tier: row.tier,
  mcr: row.mcr,
  keyAccount: row.keyAccount,
  note: row.note ?? "",
});

export function Customers({
  user,
  onDirty,
}: {
  user: User;
  onDirty: (dirty: boolean) => void;
}) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [status, setStatus] = useState("active");
  const [grouped, setGrouped] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Form>(blank);
  const [saved, setSaved] = useState<Form>(blank);
  const [historyDate, setHistoryDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
  );
  const [historyBody, setHistoryBody] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(
    () =>
      owners.flatMap((owner) =>
        owner.customers.map((customer) => ({
          ...customer,
          ownerId: owner.userId,
          owner: owner.name,
          part: owner.part,
        })),
      ),
    [owners],
  );
  const selected = rows.find((row) => row.id === selectedId);
  const dirty =
    JSON.stringify(form) !== JSON.stringify(saved) || !!historyBody.trim();
  useEffect(() => onDirty(dirty || busy), [dirty, busy, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ owners: Owner[] }>("/api/customers", { signal: controller.signal })
      .then((result) => setOwners(result.owners))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  const visible = rows.filter(
    (row) =>
      (status === "all" || row.active === (status === "active")) &&
      (part === "all" || (row.part ?? "무소속") === part) &&
      (ownerFilter === "all" || row.ownerId === ownerFilter) &&
      `${row.name} ${row.owner} ${row.note}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  function open(row?: Row) {
    if (row) {
      const next = toForm(row);
      setSelectedId(row.id);
      setForm(next);
      setSaved(next);
      setCreating(false);
    } else {
      const next = { ...blank, userId: owners[0]?.userId ?? "" };
      setSelectedId(null);
      setForm(next);
      setSaved(next);
      setCreating(true);
    }
    setActionError("");
    setHistoryBody("");
  }
  function close() {
    if (busy) return;
    if (dirty && !confirm("저장하지 않은 변경 사항을 버릴까요?")) return;
    setCreating(false);
    setSelectedId(null);
    setHistoryBody("");
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const body = { ...form, since: form.since || null };
      if (creating) {
        const result = await api<{ id: string }>("/api/customers", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSelectedId(result.id);
        setCreating(false);
      } else
        await api(`/api/customers/${selectedId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      setSaved(form);
      setReload((x) => x + 1);
      toast.success("고객사를 저장했습니다.");
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addHistory() {
    if (!selected || !historyBody.trim() || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api(`/api/customers/${selected.id}/history`, {
        method: "POST",
        body: JSON.stringify({ eventDate: historyDate, body: historyBody }),
      });
      setHistoryBody("");
      setReload((x) => x + 1);
      toast.success("이력을 등록했습니다.");
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeHistory(id: string) {
    if (!selected || busy || !confirm("이 이력을 삭제할까요?")) return;
    setBusy(true);
    setActionError("");
    try {
      await api(`/api/customers/${selected.id}/history/${id}`, {
        method: "DELETE",
      });
      setReload((x) => x + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus() {
    if (
      !selected ||
      busy ||
      !confirm(
        selected.active
          ? "이 고객사의 운영을 종료할까요?"
          : "이 고객사의 운영을 재개할까요?",
      )
    )
      return;
    setBusy(true);
    setActionError("");
    try {
      await api(`/api/customers/${selected.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ active: !selected.active }),
      });
      setReload((x) => x + 1);
      toast.success(
        selected.active ? "운영을 종료했습니다." : "운영을 재개했습니다.",
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !selected ||
      busy ||
      !confirm(`고객사 ${selected.name}과 이력을 완전히 삭제할까요?`)
    )
      return;
    setBusy(true);
    setActionError("");
    try {
      await api(`/api/customers/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      setReload((x) => x + 1);
      toast.success("고객사를 삭제했습니다.");
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
  const groups = grouped
    ? owners
        .map((owner) => ({
          name: owner.name,
          rows: visible.filter((row) => row.ownerId === owner.userId),
        }))
        .filter((g) => g.rows.length)
    : [{ name: "", rows: visible }];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="고객사·담당자·메모 검색"
          placeholder="고객사·담당자·메모 검색"
          className="max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="파트 필터"
          className="h-9 rounded-md border bg-background px-2"
          value={part}
          onChange={(e) => setPart(e.target.value)}
        >
          <option value="all">모든 파트</option>
          {[...new Set(owners.map((x) => x.part ?? "무소속"))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="담당자 필터"
          className="h-9 rounded-md border bg-background px-2"
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
        >
          <option value="all">모든 담당자</option>
          {owners.map((o) => (
            <option value={o.userId} key={o.userId}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          aria-label="운영 상태 필터"
          className="h-9 rounded-md border bg-background px-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">운영 중</option>
          <option value="inactive">종료</option>
          <option value="all">전체</option>
        </select>
        <Button variant="outline" onClick={() => setGrouped((x) => !x)}>
          {grouped ? "고객사별 보기" : "담당자별 보기"}
        </Button>
        <Button className="ml-auto" onClick={() => open()}>
          고객사 추가
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{visible.length}개 고객사</p>
      {visible.length ? (
        groups.map((group) => (
          <section key={group.name || "all"}>
            {group.name && <h2 className="mb-2 font-semibold">{group.name}</h2>}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "고객사",
                      "담당자",
                      "파트",
                      "서비스 등급",
                      "구분",
                      "상태",
                      "메모",
                    ].map((x) => (
                      <TableHead key={x}>{x}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => open(row)}
                    >
                      <TableCell>
                        <Button
                          variant="link"
                          className="px-0 text-left"
                          onClick={() => open(row)}
                        >
                          {row.name}
                        </Button>
                      </TableCell>
                      <TableCell>{row.owner}</TableCell>
                      <TableCell>{row.part ?? "무소속"}</TableCell>
                      <TableCell>{row.tier}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.mcr && <Badge variant="secondary">MCR</Badge>}{" "}
                        {row.keyAccount && (
                          <Badge variant="outline">주요고객</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.active ? "default" : "outline"}>
                          {row.active ? "운영 중" : "종료"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-60 truncate">
                        {row.note || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))
      ) : (
        <p className="rounded-lg border p-8 text-center text-muted-foreground">
          {rows.length
            ? "검색 결과가 없습니다. 필터를 바꿔 보세요."
            : "등록된 고객사가 없습니다."}
        </p>
      )}
      <Sheet
        open={creating || !!selectedId}
        onOpenChange={(openState) => {
          if (!openState) close();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {creating ? "고객사 추가" : (selected?.name ?? "고객사 상세")}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4 pb-6">
            {actionError && (
              <Alert variant="destructive">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            <FieldGroup className="grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="customer-name">고객사 이름</FieldLabel>
                <Input
                  id="customer-name"
                  maxLength={200}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-owner">담당자</FieldLabel>
                <select
                  id="customer-owner"
                  className="h-9 rounded-md border bg-background px-2"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                >
                  {owners.map((o) => (
                    <option value={o.userId} key={o.userId}>
                      {o.name} · {o.part ?? "무소속"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-since">시작일</FieldLabel>
                <Input
                  id="customer-since"
                  type="date"
                  value={form.since}
                  onChange={(e) => setForm({ ...form, since: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-tier">서비스 등급</FieldLabel>
                <select
                  id="customer-tier"
                  className="h-9 rounded-md border bg-background px-2"
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value })}
                >
                  {["Standard", "Advanced", "Enterprise"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.mcr}
                  onChange={(e) => setForm({ ...form, mcr: e.target.checked })}
                />
                MCR
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.keyAccount}
                  onChange={(e) =>
                    setForm({ ...form, keyAccount: e.target.checked })
                  }
                />
                주요고객
              </label>
            </div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="customer-note">현재 메모</FieldLabel>
                <Textarea
                  id="customer-note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </Field>
            </FieldGroup>
            <Button
              disabled={busy || !form.name.trim() || !form.userId}
              onClick={save}
            >
              {busy ? "처리 중…" : "고객사 저장"}
            </Button>
            {selected && (
              <>
                <h3 className="border-t pt-5 font-semibold">변경 이력</h3>
                <div className="flex flex-col gap-3">
                  {selected.history.length ? (
                    selected.history.map((h) => (
                      <div className="border-b pb-3" key={h.id}>
                        <div className="flex items-center gap-2 text-sm">
                          <strong>{h.eventDate}</strong>
                          <span>{h.authorName}</span>
                          {(h.authorId === user.userId ||
                            user.role === "admin") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto"
                              disabled={busy}
                              onClick={() => removeHistory(h.id)}
                            >
                              삭제
                            </Button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap break-words">
                          {h.body}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">
                      등록된 이력이 없습니다.
                    </p>
                  )}
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="history-date">이력 날짜</FieldLabel>
                    <Input
                      id="history-date"
                      type="date"
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="history-body">새 이력</FieldLabel>
                    <Textarea
                      id="history-body"
                      maxLength={1000}
                      value={historyBody}
                      onChange={(e) => setHistoryBody(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <Button
                  variant="outline"
                  disabled={busy || !historyBody.trim()}
                  onClick={addHistory}
                >
                  이력 등록
                </Button>
                <div className="border-t pt-5">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={changeStatus}
                  >
                    {selected.active ? "운영 종료" : "운영 재개"}
                  </Button>
                </div>
                {user.role === "admin" && (
                  <div className="border-t pt-5">
                    <p className="mb-2 text-sm text-muted-foreground">
                      위험 행동 · 고객사와 이력을 완전히 삭제합니다.
                    </p>
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={remove}
                    >
                      고객사 완전 삭제
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
