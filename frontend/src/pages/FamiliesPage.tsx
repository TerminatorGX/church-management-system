import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Paginated } from "../lib/api";
import { useApi, useDebounced } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { fullName } from "../lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "../components/ui";
import type { Family } from "../lib/types";

const FamilyForm = ({
  family,
  onSaved,
  onCancel,
}: {
  family?: Family;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState({
    familyName: family?.familyName ?? "",
    address: family?.address ?? "",
    city: family?.city ?? "",
    phone: family?.phone ?? "",
    notes: family?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(family ? `/families/${family.id}` : "/families", {
        method: family ? "PATCH" : "POST",
        body: {
          ...form,
          address: form.address || null,
          city: form.city || null,
          phone: form.phone || null,
          notes: form.notes || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the family.");
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
      <Field label="Family name">
        <Input
          value={form.familyName}
          onChange={(e) => set("familyName", e.target.value)}
          placeholder="e.g. Mumba family"
          required
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : family ? "Save changes" : "Add family"}
        </Button>
      </div>
    </form>
  );
};

export const FamiliesPage = () => {
  const { can } = useAuth();
  const mayEdit = can("FINANCE", "DEPT_HEAD");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Family | null>(null);

  const debounced = useDebounced(search);

  const families = useApi(
    (signal) =>
      api<Paginated<Family>>("/families", {
        query: { page, pageSize: 25, search: debounced },
        signal,
      }),
    [page, debounced],
  );

  return (
    <>
      <PageHeader
        title="Families"
        subtitle="Households, so members can be grouped and contacted together."
        actions={mayEdit && <Button onClick={() => setCreating(true)}>Add family</Button>}
      />

      <Card>
        <div className="mb-4">
          <Input
            placeholder="Search families…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-sm"
          />
        </div>

        {families.loading && <Spinner label="Loading families" />}
        {families.error && <ErrorBox message={families.error} onRetry={families.reload} />}

        {families.data &&
          (families.data.data.length === 0 ? (
            <EmptyState title="No families yet" hint="Add one, then assign members to it." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Family</Th>
                    <Th>Head of household</Th>
                    <Th>Phone</Th>
                    <Th>City</Th>
                    <Th>Members</Th>
                    {mayEdit && <Th>{""}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {families.data.data.map((f) => {
                    const head = f.members?.[0];
                    return (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <Td className="font-medium text-slate-900">{f.familyName}</Td>
                        <Td>
                          {head ? (
                            <Link
                              to={`/members/${head.id}`}
                              className="text-brand-700 hover:underline"
                            >
                              {fullName(head)}
                            </Link>
                          ) : (
                            <span className="text-slate-400">Not set</span>
                          )}
                        </Td>
                        <Td className="text-slate-600">{head?.phone ?? f.phone ?? "—"}</Td>
                        <Td className="text-slate-600">{f.city ?? "—"}</Td>
                        <Td>{f._count?.members ?? 0}</Td>
                        {mayEdit && (
                          <Td>
                            <Button size="sm" variant="secondary" onClick={() => setEditing(f)}>
                              Edit
                            </Button>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>

              <Pagination
                page={families.data.meta.page}
                totalPages={families.data.meta.totalPages}
                total={families.data.meta.total}
                onChange={setPage}
              />
            </>
          ))}
      </Card>

      <Modal open={creating} title="Add a family" onClose={() => setCreating(false)}>
        <FamilyForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            families.reload();
          }}
        />
      </Modal>

      <Modal open={!!editing} title="Edit family" onClose={() => setEditing(null)}>
        {editing && (
          <FamilyForm
            family={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              families.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
};
