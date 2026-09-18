import { useEffect, useMemo, useState } from "react";
import {
  api,
  type OrganizationPart,
  type OrganizationUser,
  type User,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const roles = {
  engineer: "엔지니어",
  lead: "팀장",
  executive: "상무",
  admin: "관리자",
};
type Draft = Omit<OrganizationUser, "userId" | "version"> & {
  slackUserId: string;
};
const blank = (): Draft => ({
  name: "",
  slackUserId: "",
  partId: null,
  role: "engineer",
  email: "",
  phone: "",
  workStart: "09:00",
  workEnd: "18:00",
  active: true,
  joinedOn: null,
});
const toDraft = (member: OrganizationUser): Draft => ({
  name: member.name,
  slackUserId: member.slackUserId ?? "",
  partId: member.partId,
  role: member.role,
  email: member.email ?? "",
  phone: member.phone ?? "",
  workStart: member.workStart,
  workEnd: member.workEnd,
  active: member.active,
  joinedOn: member.joinedOn,
});

export function Organization({
  user,
  onDirty,
}: {
  user: User;
  onDirty: (dirty: boolean) => void;
}) {
  const [parts, setParts] = useState<OrganizationPart[]>([]);
  const [members, setMembers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [partFilter, setPartFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");
  const [editing, setEditing] = useState<OrganizationUser | null | "new">(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [saved, setSaved] = useState("");
  const [partsOpen, setPartsOpen] = useState(false);
  const [newPart, setNewPart] = useState("");
  const canEdit = user.role === "admin";
  const dirty =
    (editing !== null && JSON.stringify(draft) !== saved) ||
    (partsOpen && !!newPart.trim());
  useEffect(() => onDirty(dirty || busy), [dirty, busy, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{
      parts: OrganizationPart[];
      users: Record<string, Omit<OrganizationUser, "userId">>;
    }>("/api/organization", { signal: controller.signal })
      .then((data) => {
        setParts(data.parts);
        setMembers(
          Object.entries(data.users).map(([userId, member]) => ({
            userId,
            ...member,
          })),
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  const visible = useMemo(
    () =>
      members.filter(
        (member) =>
          (partFilter === "all" || member.partId === partFilter) &&
          (roleFilter === "all" || member.role === roleFilter) &&
          (activeFilter === "all" ||
            member.active === (activeFilter === "active")),
      ),
    [members, partFilter, roleFilter, activeFilter],
  );
  function open(member?: OrganizationUser) {
    if (!canEdit) return;
    const next = member ? toDraft(member) : blank();
    setEditing(member ?? "new");
    setDraft(next);
    setSaved(JSON.stringify(next));
    setError("");
  }
  function close(openState: boolean) {
    if (
      !openState &&
      dirty &&
      !confirm("저장하지 않은 구성원 변경을 버릴까요?")
    )
      return;
    if (!openState) setEditing(null);
  }
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
  async function saveMember() {
    if (editing === null || busy) return;
    await run(
      async () => {
        const body = {
          ...draft,
          partId: draft.partId || null,
          joinedOn: draft.joinedOn || null,
        };
        if (editing === "new")
          await api("/api/organization/users", {
            method: "POST",
            body: JSON.stringify(body),
          });
        else
          await api(`/api/organization/users/${editing.userId}`, {
            method: "PUT",
            body: JSON.stringify({ ...body, version: editing.version }),
          });
        setEditing(null);
        setSaved(JSON.stringify(draft));
      },
      editing === "new"
        ? "구성원을 추가했습니다."
        : "구성원 정보를 저장했습니다.",
    );
  }
  async function addPart() {
    await run(async () => {
      await api("/api/organization/parts", {
        method: "POST",
        body: JSON.stringify({ name: newPart.trim() }),
      });
      setNewPart("");
    }, "파트를 추가했습니다.");
  }
  async function savePart(
    part: OrganizationPart,
    name: string,
    sortOrder: string,
  ) {
    await run(
      () =>
        api(`/api/organization/parts/${part.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            sortOrder: Number(sortOrder),
          }),
        }),
      "파트를 저장했습니다.",
    );
  }
  async function removePart(part: OrganizationPart) {
    if (!confirm(`${part.name} 파트를 삭제할까요?`)) return;
    await run(
      () => api(`/api/organization/parts/${part.id}`, { method: "DELETE" }),
      "파트를 삭제했습니다.",
    );
  }
  if (loading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="파트 필터"
          className="h-9 rounded-md border bg-background px-2"
          value={partFilter}
          onChange={(event) => setPartFilter(event.target.value)}
        >
          <option value="all">모든 파트</option>
          <option value="">무소속</option>
          {parts.map((part) => (
            <option value={part.id} key={part.id}>
              {part.name}
            </option>
          ))}
        </select>
        <select
          aria-label="역할 필터"
          className="h-9 rounded-md border bg-background px-2"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="all">모든 역할</option>
          {Object.entries(roles).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="활성 상태 필터"
          className="h-9 rounded-md border bg-background px-2"
          value={activeFilter}
          onChange={(event) => setActiveFilter(event.target.value)}
        >
          <option value="active">활성 구성원</option>
          <option value="inactive">비활성 구성원</option>
          <option value="all">전체</option>
        </select>
        {canEdit && (
          <>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => setPartsOpen(true)}
            >
              파트 관리
            </Button>
            <Button onClick={() => open()}>구성원 추가</Button>
          </>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        {visible.length}명 · 구성원 정보는 열람 가능하며 수정은 관리자만 할 수
        있습니다.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "이름",
                "파트",
                "역할",
                "근무 시간",
                "입사일",
                "활성 상태",
                "",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <strong>{member.name}</strong>
                  <small className="block text-muted-foreground">
                    {member.email || "이메일 미등록"} ·{" "}
                    {member.phone || "전화번호 미등록"}
                  </small>
                </TableCell>
                <TableCell>
                  {parts.find((part) => part.id === member.partId)?.name ??
                    "무소속"}
                </TableCell>
                <TableCell>{roles[member.role]}</TableCell>
                <TableCell>
                  {member.workStart}–{member.workEnd}
                </TableCell>
                <TableCell>{member.joinedOn || "미등록"}</TableCell>
                <TableCell>
                  <Badge variant={member.active ? "default" : "outline"}>
                    {member.active ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => open(member)}
                    >
                      수정
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  조건에 맞는 구성원이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={editing !== null} onOpenChange={close}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "구성원 추가" : "구성원 수정"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 px-4">
            <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="member-name">이름</FieldLabel>
                <Input
                  id="member-name"
                  maxLength={100}
                  value={draft.name}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-slack">Slack 사용자 ID</FieldLabel>
                <Input
                  id="member-slack"
                  maxLength={100}
                  value={draft.slackUserId}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, slackUserId: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-part">파트</FieldLabel>
                <select
                  id="member-part"
                  className="h-9 rounded-md border bg-background px-2"
                  value={draft.partId ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, partId: event.target.value || null })
                  }
                >
                  <option value="">무소속</option>
                  {parts.map((part) => (
                    <option value={part.id} key={part.id}>
                      {part.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="member-role">역할</FieldLabel>
                <select
                  id="member-role"
                  className="h-9 rounded-md border bg-background px-2"
                  value={draft.role}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      role: event.target.value as Draft["role"],
                    })
                  }
                >
                  {Object.entries(roles).map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="member-email">이메일</FieldLabel>
                <Input
                  id="member-email"
                  type="email"
                  maxLength={254}
                  value={draft.email}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, email: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-phone">전화번호</FieldLabel>
                <Input
                  id="member-phone"
                  maxLength={100}
                  value={draft.phone}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, phone: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-joined">입사일</FieldLabel>
                <Input
                  id="member-joined"
                  type="date"
                  value={draft.joinedOn ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, joinedOn: event.target.value || null })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-start">출근 시간</FieldLabel>
                <Input
                  id="member-start"
                  type="time"
                  value={draft.workStart}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, workStart: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-end">퇴근 시간</FieldLabel>
                <Input
                  id="member-end"
                  type="time"
                  value={draft.workEnd}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, workEnd: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            {editing !== "new" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, active: event.target.checked })
                  }
                />
                활성 구성원 (해제하면 로그인 차단)
              </label>
            )}
            <p className="text-sm text-muted-foreground">
              입사일은 발표 순서에 사용됩니다. 마지막 관리자는 비활성화하거나
              권한을 해제할 수 없습니다.
            </p>
            <Button
              disabled={busy || !draft.name.trim() || !draft.slackUserId.trim()}
              onClick={saveMember}
            >
              {busy ? "저장 중…" : "저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={partsOpen}
        onOpenChange={(open) => {
          if (!open && newPart.trim() && !confirm("새 파트 입력을 버릴까요?"))
            return;
          if (!open) setNewPart("");
          setPartsOpen(open);
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>파트 관리</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-4">
            <p className="text-sm text-muted-foreground">
              소속 구성원이 없는 파트만 삭제할 수 있습니다. 낮은 발표 순서가
              먼저 표시됩니다.
            </p>
            {parts.map((part) => (
              <PartEditor
                key={part.id}
                part={part}
                occupied={members.some((member) => member.partId === part.id)}
                busy={busy}
                onSave={savePart}
                onDelete={removePart}
              />
            ))}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-part">새 파트</FieldLabel>
                <Input
                  id="new-part"
                  maxLength={100}
                  value={newPart}
                  disabled={busy}
                  onChange={(event) => setNewPart(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Button disabled={busy || !newPart.trim()} onClick={addPart}>
              파트 추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartEditor({
  part,
  occupied,
  busy,
  onSave,
  onDelete,
}: {
  part: OrganizationPart;
  occupied: boolean;
  busy: boolean;
  onSave: (part: OrganizationPart, name: string, order: string) => void;
  onDelete: (part: OrganizationPart) => void;
}) {
  const [name, setName] = useState(part.name);
  const [order, setOrder] = useState(String(part.sortOrder));
  useEffect(() => {
    setName(part.name);
    setOrder(String(part.sortOrder));
  }, [part]);
  return (
    <div className="grid grid-cols-1 gap-2 border-b py-3 sm:grid-cols-[1fr_7rem_auto_auto]">
      <Input
        aria-label={`${part.name} 파트 이름`}
        maxLength={100}
        value={name}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        aria-label={`${part.name} 발표 순서`}
        type="number"
        min={0}
        step={1}
        value={order}
        disabled={busy}
        onChange={(event) => setOrder(event.target.value)}
      />
      <Button
        size="sm"
        disabled={busy || !name.trim()}
        onClick={() => onSave(part, name, order)}
      >
        저장
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || occupied}
        onClick={() => onDelete(part)}
      >
        삭제
      </Button>
    </div>
  );
}
