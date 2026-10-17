export type Role = "ADMIN" | "FINANCE" | "DEPT_HEAD" | "VIEWER";
export type Gender = "MALE" | "FEMALE" | "UNSPECIFIED";
export type MaritalStatus = "SINGLE" | "MARRIED" | "WIDOWED" | "DIVORCED" | "UNSPECIFIED";
export type EventType =
  | "SUNDAY_SERVICE"
  | "MIDWEEK_SERVICE"
  | "SMALL_GROUP"
  | "SPECIAL_EVENT"
  | "OUTREACH"
  | "CONFERENCE";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CHEQUE" | "IN_KIND";
export type AssignmentStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "COMPLETED" | "CANCELLED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  memberId: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  member?: { id: string; firstName: string; lastName: string } | null;
}

export interface Family {
  id: string;
  familyName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  notes: string | null;
  _count?: { members: number };
  members?: Member[];
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  leader?: { id: string; name: string; email: string } | null;
  _count?: { members: number };
  members?: { id: string; roleTitle: string | null; member: Member }[];
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: Gender;
  maritalStatus: MaritalStatus;
  baptismDate: string | null;
  joinedDate: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  occupation: string | null;
  notes: string | null;
  isActive: boolean;
  isFamilyHead: boolean;
  safeguardingCleared: boolean;
  skills: string[];
  interests: string[];
  familyId: string | null;
  family?: { id: string; familyName: string; members?: Member[] } | null;
  departmentMemberships?: { roleTitle: string | null; department: { id: string; name: string } }[];
  stats?: {
    attendanceCount: number;
    totalGiven?: string;
    contributionCount?: number;
  };
  attendances?: {
    id: string;
    status: AttendanceStatus;
    event: { id: string; name: string; startsAt: string; type: EventType };
  }[];
  volunteerAssignments?: {
    id: string;
    status: AssignmentStatus;
    event: { id: string; name: string; startsAt: string };
    role: { id: string; name: string };
  }[];
  user?: { id: string; email: string; role: Role } | null;
}

export interface PossibleDuplicateMember {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  isActive: boolean;
  family: { familyName: string } | null;
  matchedOn: ("name" | "phone" | "email")[];
}

export interface ChurchEvent {
  id: string;
  name: string;
  type: EventType;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  description: string | null;
  departmentId: string | null;
  capacity: number | null;
  department?: { id: string; name: string } | null;
  _count?: { attendances: number; assignments: number };
  attendanceSummary?: Partial<Record<AttendanceStatus, number>>;
  assignments?: VolunteerAssignment[];
}

export interface Fund {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  total?: string;
  contributionCount?: number;
}

export interface Contribution {
  id: string;
  amount: string;
  currency: string;
  receivedOn: string;
  paymentMethod: PaymentMethod;
  receiptNumber: string;
  notes: string | null;
  fund: { id: string; name: string };
  member: { id: string; firstName: string; lastName: string } | null;
  recordedBy?: { id: string; name: string } | null;
}

export interface VolunteerRole {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  minimumAge: number | null;
  requiresSafeguardingClearance: boolean;
  _count?: { assignments: number };
}

export interface VolunteerAssignment {
  id: string;
  status: AssignmentStatus;
  notes: string | null;
  serviceHours: string | null;
  member: { id: string; firstName: string; lastName: string; phone: string | null; skills?: string[] };
  event: { id: string; name: string; startsAt: string; type?: EventType; location?: string | null };
  role: { id: string; name: string };
}

export interface RosterEntry {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    family: { familyName: string } | null;
  };
  status: AttendanceStatus | null;
  note: string | null;
}

export interface DashboardSummary {
  activeMembers: number;
  totalFamilies: number;
  newThisMonth: number;
  upcomingEvents: number;
  pendingAssignments: number;
  lastService: { id: string; name: string; startsAt: string; attendance: number } | null;
  finance: {
    thisMonth: string;
    previousMonth: string;
    contributionCount: number;
    changePercent: number | null;
  } | null;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolsUsed: string[];
  createdAt: string;
}

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  summary: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}
