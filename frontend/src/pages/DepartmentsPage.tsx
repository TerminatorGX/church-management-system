import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
} from "../components/ui";
import type { Department } from "../lib/types";

const DepartmentForm = ({
  department,
  onSaved,
  onCancel,
}: {
  department?: Department;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(department?.name ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [isActive, setIsActive] = useState(department?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(department ? `/departments/${department.id}` : "/departments", {
        method: department ? "PATCH" : "POST",
        body: { name, description: description || null, isActive },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the department.");
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
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Checkbox label="Active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : department ? "Save changes" : "Add department"}
        </Button>
      </div>
    </form>
  );
};

export const DepartmentsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

  const departments = useApi(
    (signal) => api<{ data: Department[] }>("/departments", { signal }),
    [],
  );

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Ministries and teams within the church."
        actions={isAdmin && <Button onClick={() => setCreating(true)}>Add department</Button>}
      />

      {departments.loading && <Spinner label="Loading departments" />}
      {departments.error && <ErrorBox message={departments.error} onRetry={departments.reload} />}

      {departments.data &&
        (departments.data.data.length === 0 ? (
          <Card>
            <EmptyState title="No departments yet" hint="Add one to start grouping members." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {departments.data.data.map((d) => (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{d.name}</h3>
                    {d.description && (
                      <p className="mt-1 text-sm text-slate-500">{d.description}</p>
                    )}
                  </div>
                  {!d.isActive && <Badge>Inactive</Badge>}
                </div>

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Members</dt>
                    <dd className="font-medium text-slate-800">{d._count?.members ?? 0}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Leader</dt>
                    <dd className="truncate text-slate-800">{d.leader?.name ?? "Not assigned"}</dd>
                  </div>
                </dl>

                {isAdmin && (
                  <div className="mt-4">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                      Edit
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ))}

      <Modal open={creating} title="Add a department" onClose={() => setCreating(false)}>
        <DepartmentForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            departments.reload();
          }}
        />
      </Modal>

      <Modal open={!!editing} title="Edit department" onClose={() => setEditing(null)}>
        {editing && (
          <DepartmentForm
            department={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              departments.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
};
