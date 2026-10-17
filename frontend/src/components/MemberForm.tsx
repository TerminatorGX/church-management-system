import { useEffect, useState } from "react";
import { UserRoundSearch, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useDebounced } from "../hooks/useApi";
import { fmtDate, toDateInput, titleCase, titleCaseName } from "../lib/format";
import { districtsForProvince, provinceForDistrict, ZAMBIA_PROVINCES } from "../lib/zambia";
import { Button, Checkbox, Field, Input, Select, Textarea } from "./ui";
import type { Family, Gender, MaritalStatus, Member, PossibleDuplicateMember } from "../lib/types";

const GENDERS: Gender[] = ["UNSPECIFIED", "MALE", "FEMALE"];
const MARITAL: MaritalStatus[] = ["UNSPECIFIED", "SINGLE", "MARRIED", "WIDOWED", "DIVORCED"];

/** Zambian mobile numbers — mirrors the backend's format check in validators.ts. */
const ZM_PHONE_PATTERN = "^(?:\\+?260|0)(7|9)\\d{8}$";
const ZM_PHONE_RE = /^(?:\+?260|0)(7|9)(\d{8})$/;

/** Only a value that actually looks like a real phone number is worth a duplicate lookup. */
const normalizedPhoneOrNull = (v: string) => {
  const digits = v.replace(/[\s-]/g, "");
  const m = ZM_PHONE_RE.exec(digits);
  return m ? `+260${m[1]}${m[2]}` : null;
};

const MATCH_LABEL: Record<PossibleDuplicateMember["matchedOn"][number], string> = {
  phone: "Same phone number",
  email: "Same email",
  name: "Same name",
};

const todayInput = () => new Date().toISOString().slice(0, 10);

interface Props {
  member?: Member;
  families: Family[];
  onSaved: (member: Member) => void;
  onCancel: () => void;
}

export const MemberForm = ({ member, families, onSaved, onCancel }: Props) => {
  const [form, setForm] = useState({
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    dateOfBirth: toDateInput(member?.dateOfBirth),
    gender: member?.gender ?? "UNSPECIFIED",
    maritalStatus: member?.maritalStatus ?? "UNSPECIFIED",
    baptismDate: toDateInput(member?.baptismDate),
    joinedDate: toDateInput(member?.joinedDate),
    address: member?.address ?? "",
    province: member?.province ?? provinceForDistrict(member?.city) ?? "",
    city: member?.city ?? "",
    occupation: member?.occupation ?? "",
    notes: member?.notes ?? "",
    familyId: member?.familyId ?? "",
    isFamilyHead: member?.isFamilyHead ?? false,
    isActive: member?.isActive ?? true,
    safeguardingCleared: member?.safeguardingCleared ?? false,
    skills: (member?.skills ?? []).join(", "),
    interests: (member?.interests ?? []).join(", "),
  });

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [duplicates, setDuplicates] = useState<PossibleDuplicateMember[]>([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const dupSignal = useDebounced(
    `${form.firstName}|${form.lastName}|${form.phone}|${form.email}`,
    500,
  );

  // Heads-up only — never blocks saving. Shared names are normal in a
  // congregation, so a name match alone is weak evidence; a matching phone
  // or email is much stronger. The human reviewing it decides, not the app.
  useEffect(() => {
    setDuplicatesDismissed(false);
    const [firstName, lastName, phoneRaw, emailRaw] = dupSignal.split("|");
    const hasName = firstName!.trim().length > 1 && lastName!.trim().length > 1;
    const phone = normalizedPhoneOrNull(phoneRaw!);
    const email = emailRaw!.trim().toLowerCase();
    const hasEmail = /\S+@\S+\.\S+/.test(email);

    if (!hasName && !phone && !hasEmail) {
      setDuplicates([]);
      return;
    }

    const controller = new AbortController();
    api<{ data: PossibleDuplicateMember[] }>("/members/possible-duplicates", {
      query: {
        firstName: hasName ? firstName : undefined,
        lastName: hasName ? lastName : undefined,
        phone: phone ?? undefined,
        email: hasEmail ? email : undefined,
        excludeId: member?.id,
      },
      signal: controller.signal,
    })
      .then((res) => setDuplicates(res.data))
      .catch(() => {});

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupSignal, member?.id]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const splitList = (value: string) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaving(true);

    const body = {
      ...form,
      email: form.email || null,
      phone: form.phone || null,
      dateOfBirth: form.dateOfBirth || null,
      baptismDate: form.baptismDate || null,
      joinedDate: form.joinedDate || null,
      address: form.address || null,
      province: form.province || null,
      city: form.city || null,
      occupation: form.occupation || null,
      notes: form.notes || null,
      familyId: form.familyId || null,
      skills: splitList(form.skills),
      interests: splitList(form.interests),
    };

    try {
      const res = await api<{ data: Member }>(member ? `/members/${member.id}` : "/members", {
        method: member ? "PATCH" : "POST",
        body,
      });
      onSaved(res.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
      } else {
        setError("Could not save. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={fieldErrors.firstName}>
          <Input
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            onBlur={(e) => set("firstName", titleCaseName(e.target.value))}
            required
          />
        </Field>
        <Field label="Last name" error={fieldErrors.lastName}>
          <Input
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            onBlur={(e) => set("lastName", titleCaseName(e.target.value))}
            required
          />
        </Field>
        <Field label="Phone" error={fieldErrors.phone} hint="e.g. 0971234567">
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            pattern={ZM_PHONE_PATTERN}
            title="A Zambian mobile number, e.g. 0971234567"
            placeholder="0971234567"
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={(e) => set("email", e.target.value.trim().toLowerCase())}
          />
        </Field>
        <Field label="Date of birth">
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            max={todayInput()}
          />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {titleCase(g)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Marital status">
          <Select
            value={form.maritalStatus}
            onChange={(e) => set("maritalStatus", e.target.value as MaritalStatus)}
          >
            {MARITAL.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Occupation">
          <Input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </Field>
        <Field label="Baptism date">
          <Input
            type="date"
            value={form.baptismDate}
            onChange={(e) => set("baptismDate", e.target.value)}
            min={form.dateOfBirth || undefined}
            max={todayInput()}
          />
        </Field>
        <Field label="Joined the church">
          <Input
            type="date"
            value={form.joinedDate}
            onChange={(e) => set("joinedDate", e.target.value)}
            max={todayInput()}
          />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Province">
          <Select
            value={form.province}
            onChange={(e) => {
              const province = e.target.value;
              // A district only makes sense within its own province — clear
              // it if it no longer belongs to the newly chosen one.
              const stillValid = districtsForProvince(province).includes(form.city);
              setForm((f) => ({ ...f, province, city: stillValid ? f.city : "" }));
            }}
          >
            <option value="">Select a province…</option>
            {ZAMBIA_PROVINCES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City / District" hint={!form.province ? "Pick a province first" : undefined}>
          <Select value={form.city} onChange={(e) => set("city", e.target.value)} disabled={!form.province}>
            <option value="">{form.province ? "Select a city/district…" : "—"}</option>
            {districtsForProvince(form.province).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Family">
          <Select value={form.familyId} onChange={(e) => set("familyId", e.target.value)}>
            <option value="">No family assigned</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.familyName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skills" hint="Comma separated — used to suggest volunteers">
          <Input
            value={form.skills}
            onChange={(e) => set("skills", e.target.value)}
            placeholder="Singing, Keyboard, Teaching"
          />
        </Field>
        <Field label="Interests" hint="Comma separated">
          <Input
            value={form.interests}
            onChange={(e) => set("interests", e.target.value)}
            placeholder="Worship, Outreach"
          />
        </Field>
      </div>

      {duplicates.length > 0 && !duplicatesDismissed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <UserRoundSearch size={16} className="mt-0.5 shrink-0" />
              <p className="font-medium">
                {duplicates.length === 1 ? "A similar member already exists" : "Similar members already exist"}
                {" — check this isn't the same person before saving."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDuplicatesDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {duplicates.map((d) => (
              <li key={d.id} className="rounded-md bg-white/60 px-3 py-2">
                <span className="font-medium text-slate-900">
                  {d.firstName} {d.lastName}
                </span>
                {!d.isActive && <span className="ml-1.5 text-xs text-slate-500">(archived)</span>}
                <span className="ml-2 text-xs text-amber-800">
                  {d.matchedOn.map((m) => MATCH_LABEL[m]).join(", ")}
                </span>
                <div className="mt-0.5 text-xs text-slate-600">
                  {[d.phone, d.email, d.dateOfBirth ? `born ${fmtDate(d.dateOfBirth)}` : null, d.family?.familyName]
                    .filter(Boolean)
                    .join(" · ") || "No other details on file"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Notes">
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-6">
        <Checkbox
          label="Head of household"
          checked={form.isFamilyHead}
          onChange={(e) => set("isFamilyHead", e.target.checked)}
        />
        <Checkbox
          label="Active member"
          checked={form.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
        <Checkbox
          label="Safeguarding cleared"
          checked={form.safeguardingCleared}
          onChange={(e) => set("safeguardingCleared", e.target.checked)}
        />
      </div>
      <p className="-mt-3 text-xs text-slate-500">
        Background check / child-protection training completed — required before this member can be
        assigned to volunteer roles that need it.
      </p>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : member ? "Save changes" : "Add member"}
        </Button>
      </div>
    </form>
  );
};
