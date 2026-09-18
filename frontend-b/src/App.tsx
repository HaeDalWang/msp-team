import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  MessageSquareText,
  PencilLine,
  Building2,
  CalendarRange,
  TimerReset,
  ShieldCheck,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { api, type User } from "@/lib/api";
import { currentWeek, moveWeek, validWeek } from "@/lib/week";
import { Reviews } from "@/features/Reviews";
import { ReviewEdit } from "@/features/ReviewEdit";
import { Customers } from "@/features/Customers";
import { Schedule } from "@/features/Schedule";
import { CompLeave } from "@/features/CompLeave";
import { Organization } from "@/features/Organization";
import { MonthlyDigest } from "@/features/MonthlyDigest";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

const pages = [
  {
    id: "review",
    name: "리뷰",
    icon: MessageSquareText,
    group: "회고",
    ready: true,
  },
  {
    id: "edit",
    name: "내 회고 작성",
    icon: PencilLine,
    group: "회고",
    ready: true,
  },
  {
    id: "dashboard",
    name: "팀 현황",
    icon: LayoutDashboard,
    group: "회고",
    ready: true,
  },
  {
    id: "customers",
    name: "담당 고객사",
    icon: Building2,
    group: "팀 업무",
    ready: true,
  },
  {
    id: "schedule",
    name: "일정 관리",
    icon: CalendarRange,
    group: "팀 업무",
    ready: true,
  },
  {
    id: "comp-leave",
    name: "대체휴가",
    icon: TimerReset,
    group: "팀 업무",
    ready: true,
  },
  {
    id: "monthly-digest",
    name: "AWS 월간 What's New",
    icon: FileText,
    group: "팀 업무",
    ready: true,
  },
  {
    id: "organization",
    name: "조직 관리",
    icon: ShieldCheck,
    group: "팀 정보",
    ready: true,
  },
] as const;
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
}
function initialView() {
  const value = location.hash.slice(1);
  return pages.some((page) => page.id === value) ? value : "review";
}
function initialWeek() {
  const value = new URLSearchParams(location.search).get("week");
  return validWeek(value) ? value : currentWeek();
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState(initialView);
  const [week, setWeek] = useState(initialWeek);
  const [dirty, setDirty] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    stored("msp-theme") === "light" ? "light" : "dark",
  );
  const [fontScale, setFontScale] = useState(() =>
    Math.min(130, Math.max(85, Number(stored("msp-font-scale")) || 110)),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<{
    email: string;
    phone: string;
    joinedOn: string | null;
    version: number;
  } | null>(null);
  const [profileSaved, setProfileSaved] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const skipUnload = useRef(false);
  const profileDirty = !!profile && JSON.stringify(profile) !== profileSaved;
  const canLeave = useCallback(
    () =>
      !(dirty || profileDirty || profileBusy) ||
      (!profileBusy &&
        confirm(
          "저장하지 않은 입력이 있습니다. 변경 내용을 버리고 이동할까요?",
        )),
    [dirty, profileDirty, profileBusy],
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.setProperty(
      "--msp-scale",
      String(fontScale / 100),
    );
    save("msp-theme", theme);
    save("msp-font-scale", String(fontScale));
  }, [theme, fontScale]);
  useEffect(() => save("msp-design", "b"), []);
  useEffect(() => {
    api<User>("/api/me")
      .then(setUser)
      .catch((e) => setAuthError(e.status === 401 ? "" : e.message))
      .finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!skipUnload.current && (dirty || profileDirty || profileBusy)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, profileDirty, profileBusy]);
  useEffect(() => {
    const handler = () => {
      const next = initialView();
      if (next !== view) {
        if (canLeave()) {
          setDirty(false);
          setView(next);
        } else
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}#${view}`,
          );
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [view, canLeave]);
  function navigate(next: string) {
    if (next === view) return;
    if (!canLeave()) return;
    setDirty(false);
    const page = pages.find((item) => item.id === next);
    if (!page?.ready) {
      skipUnload.current = true;
      location.href = `/?week=${encodeURIComponent(week)}&design=a#${next}`;
      return;
    }
    history.pushState(null, "", `/b/?week=${encodeURIComponent(week)}#${next}`);
    setView(next);
  }
  function changeWeek(next: string) {
    if (!canLeave()) return;
    setDirty(false);
    setWeek(next);
    history.replaceState(
      null,
      "",
      `/b/?week=${encodeURIComponent(next)}#${view}`,
    );
  }
  function switchDesign() {
    if (!canLeave()) return;
    save("msp-design", "a");
    skipUnload.current = true;
    location.href = `/?week=${encodeURIComponent(week)}#${view}`;
  }
  function login() {
    try {
      sessionStorage.setItem(
        "msp-return-to",
        `/b/?week=${encodeURIComponent(week)}#${view}`,
      );
    } catch {
      /* storage may be unavailable */
    }
    location.href = "/auth/slack";
  }
  async function openProfile() {
    if (
      profileDirty &&
      !confirm("입력한 내용을 서버의 정보로 다시 불러올까요?")
    )
      return;
    setProfileBusy(true);
    setProfileError("");
    try {
      const value = await api<typeof profile>("/api/profile");
      setProfile(value);
      setProfileSaved(JSON.stringify(value));
      setSettingsOpen(true);
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function saveProfile() {
    if (!profile || profileBusy) return;
    setProfileBusy(true);
    setProfileError("");
    try {
      const result = await api<typeof profile>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      setProfile(result);
      setProfileSaved(JSON.stringify(result));
      toast.success("내 정보를 저장했습니다.");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  const page = pages.find((item) => item.id === view) ?? pages[0];
  if (!checked)
    return (
      <div className="p-6">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (!user)
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 p-6">
        <p className="text-sm font-semibold text-muted-foreground">CSG MSP</p>
        <h1 className="text-2xl font-semibold">MSP 주간회고</h1>
        <p>
          {authError ||
            "등록된 MSP 팀원만 Slack 계정으로 로그인할 수 있습니다."}
        </p>
        <Button onClick={login}>Slack으로 로그인</Button>
      </main>
    );
  return (
    <TooltipProvider>
      <SidebarProvider
        style={{ "--sidebar-width": "13.5rem" } as React.CSSProperties}
      >
        <Sidebar collapsible="offcanvas">
          <SidebarHeader className="border-b px-4 py-4">
            <strong>MSP 주간회고</strong>
            <span className="text-xs text-muted-foreground">
              CSG MSP · 새 디자인
            </span>
          </SidebarHeader>
          <SidebarContent>
            {["회고", "팀 업무", "팀 정보"].map((group) => (
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pages
                      .filter((item) => item.group === group)
                      .map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={view === item.id}
                            onClick={() => navigate(item.id)}
                          >
                            <item.icon />
                            <span>{item.name}</span>
                            {!item.ready && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                기존 화면
                              </span>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter className="border-t p-3">
            <span className="px-2 text-sm">{user.name}</span>
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings /> 화면 설정
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                if (canLeave()) {
                  skipUnload.current = true;
                  location.href = "/auth/logout";
                }
              }}
            >
              <LogOut /> 로그아웃
            </Button>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="flex min-h-16 flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
            <SidebarTrigger />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold md:text-2xl">{page.name}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={switchDesign}>
                기존 디자인 A
              </Button>
              <Button aria-current="page" variant="secondary">
                새 디자인 B
              </Button>
            </div>
          </header>
          <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            {["review", "edit", "dashboard"].includes(view) && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => changeWeek(moveWeek(week, -1))}
                >
                  이전 주
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  시작 주{" "}
                  <Input
                    type="date"
                    aria-label="회고 시작 주"
                    className="w-40"
                    value={week}
                    onChange={(e) => {
                      if (validWeek(e.target.value)) changeWeek(e.target.value);
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() => changeWeek(currentWeek())}
                >
                  이번 주
                </Button>
                <Button
                  variant="outline"
                  onClick={() => changeWeek(moveWeek(week, 1))}
                >
                  다음 주
                </Button>
              </div>
            )}
            {view === "review" && (
              <Reviews week={week} user={user} onDirty={setDirty} />
            )}
            {view === "dashboard" && (
              <Reviews week={week} user={user} dashboard onDirty={setDirty} />
            )}
            {view === "edit" && (
              <ReviewEdit week={week} user={user} onDirty={setDirty} />
            )}
            {view === "customers" && (
              <Customers user={user} onDirty={setDirty} />
            )}
            {view === "schedule" && <Schedule user={user} onDirty={setDirty} />}
            {view === "comp-leave" && (
              <CompLeave user={user} onDirty={setDirty} />
            )}
            {view === "organization" && (
              <Organization user={user} onDirty={setDirty} />
            )}
            {view === "monthly-digest" && (
              <MonthlyDigest onDirty={setDirty} />
            )}
            {!page.ready && (
              <Alert>
                <AlertDescription>
                  이 페이지의 새 디자인은 준비 중입니다. 메뉴를 선택하면 기존
                  화면에서 업무를 계속할 수 있습니다.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Sheet
        open={settingsOpen}
        onOpenChange={(open) => {
          if (
            !open &&
            profileDirty &&
            !confirm("저장하지 않은 내 정보 변경을 버릴까요?")
          )
            return;
          if (!open && profileDirty)
            setProfile(profileSaved ? JSON.parse(profileSaved) : null);
          setSettingsOpen(open);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>화면 설정과 내 정보</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4">
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "secondary" : "outline"}
                onClick={() => setTheme("light")}
              >
                라이트
              </Button>
              <Button
                variant={theme === "dark" ? "secondary" : "outline"}
                onClick={() => setTheme("dark")}
              >
                다크
              </Button>
            </div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="font-scale">
                  글자 크기 {fontScale}%
                </FieldLabel>
                <Input
                  id="font-scale"
                  type="range"
                  min={85}
                  max={130}
                  step={5}
                  value={fontScale}
                  onChange={(e) => setFontScale(Number(e.target.value))}
                />
              </Field>
            </FieldGroup>
            <Button
              variant="outline"
              disabled={profileBusy}
              onClick={openProfile}
            >
              내 정보 {profile ? "다시 불러오기" : "수정"}
            </Button>
            {profileError && (
              <Alert variant="destructive">
                <AlertDescription>{profileError}</AlertDescription>
              </Alert>
            )}
            {profile && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="profile-email">이메일</FieldLabel>
                  <Input
                    id="profile-email"
                    type="email"
                    maxLength={254}
                    value={profile.email ?? ""}
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-phone">전화번호</FieldLabel>
                  <Input
                    id="profile-phone"
                    maxLength={100}
                    value={profile.phone ?? ""}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-joined">입사일</FieldLabel>
                  <Input
                    id="profile-joined"
                    type="date"
                    value={profile.joinedOn ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        joinedOn: e.target.value || null,
                      })
                    }
                  />
                </Field>
                <Button
                  disabled={profileBusy || !profileDirty}
                  onClick={saveProfile}
                >
                  내 정보 저장
                </Button>
              </FieldGroup>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Toaster theme={theme} />
    </TooltipProvider>
  );
}
export default App;
