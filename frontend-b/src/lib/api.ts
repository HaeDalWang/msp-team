export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error || `요청에 실패했습니다. (${response.status})`,
      response.status,
    );
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export type User = {
  userId: string;
  name: string;
  role: "engineer" | "lead" | "executive" | "admin";
};
export type Review = {
  id: string;
  name: string;
  part: string | null;
  role: string;
  reviewId: string | null;
  workHighlights: string;
  actionItems: string;
  topsProjects: string;
  otherNotes: string;
  status: "missing" | "draft" | "submitted" | "reviewed" | "recheck";
  tickets: [number, number, number];
  version: number;
  updatedAt: string | null;
  reviewedBy: string | null;
  meetingLeave: string | null;
};
export type Comment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
export type Customer = {
  id: string;
  name: string;
  since: string | null;
  tier: string;
  mcr: boolean;
  keyAccount: boolean;
  note: string;
  active: boolean;
  history: CustomerHistory[];
};
export type CustomerHistory = {
  id: string;
  eventDate: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};
export type Owner = {
  userId: string;
  name: string;
  part: string | null;
  customers: Customer[];
};

export type TeamMember = {
  id: string;
  name: string;
  part: string | null;
  role: string;
  workStart: string;
  workEnd: string;
};
export type ScheduleEntry = {
  type?: string;
  note?: string;
  leaveHours?: number;
};
export type Holiday = { date: string; name: string };
export type TimeSummary = {
  userId: string;
  accruedHours: number;
  usedHours: number;
  balanceHours: number;
  pendingHours: number;
  pendingLeaveHours: number;
};
export type OvertimeRecord = {
  id: string;
  date: string;
  type: string;
  customer: string;
  startTime: string;
  endTime: string;
  hours: number;
  detail: string;
  evidence: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
};
export type LeaveRecord = {
  id: string;
  date: string;
  hours: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
};
export type OrganizationPart = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};
export type OrganizationUser = {
  userId: string;
  name: string;
  partId: string | null;
  role: "engineer" | "lead" | "executive" | "admin";
  version: number;
  email: string;
  phone: string;
  workStart: string;
  workEnd: string;
  active: boolean;
  joinedOn: string | null;
  slackUserId?: string;
};
