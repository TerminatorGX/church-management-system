import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { toDateInput, titleCase } from "../lib/format";
import { Button, Field, Input, Select, Textarea } from "./ui";
import type { Family, Gender, MaritalStatus, Member } from "../lib/types";

const GENDERS: Gender[] = ["UNSPECIFIED", "MALE", "FEMALE"];
const MARITAL: MaritalStatus[] = ["UNSPECIFIED", "SINGLE", "MARRIED", "WIDOWED", "DIVORCED"];

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
    city: member?.city ?? "",
    occupation: member?.occupation ?? "",
    notes: member?.notes ?? "",
    familyId: member?.familyId ?? "",
    isFamilyHead: member?.isFamilyHead ?? false,
    isActive: member?.isActive ?? true,
    skills: (member?.skills ?? []).join(", "),
    interests: (member?.interests ?? []).join(", "),
  });

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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
          <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
        </Field>
        <Field label="Last name" error={fieldErrors.lastName}>
          <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
        </Field>
        <Field label="Phone" error={fieldErrors.phone}>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
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
          <Input type="date" value={form.baptismDate} onChange={(e) => set("baptismDate", e.target.value)} />
        </Field>
        <Field label="Joined the church">
          <Input type="date" value={form.joinedDate} onChange={(e) => set("joinedDate", e.target.value)} />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
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

      <Field label="Notes">
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isFamilyHead}
            onChange={(e) => set("isFamilyHead", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Head of household
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active member
        </label>
      </div>

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
