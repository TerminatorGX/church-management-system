import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { fmtMoney } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "../components/ui";
import type { Fund } from "../lib/types";

const FundForm = ({
  fund,
  onSaved,
  onCancel,
}: {
  fund?: Fund;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(fund?.name ?? "");
  const [description, setDescription] = useState(fund?.description ?? "");
  const [isActive, setIsActive] = useState(fund?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(fund ? `/funds/${fund.id}` : "/funds", {
        method: fund ? "PATCH" : "POST",
        body: { name, description: description || null, isActive },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the fund.");
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
      <Field label="Fund name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Accepting contributions
      </label>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : fund ? "Save changes" : "Add fund"}
        </Button>
      </div>
    </form>
  );
};

export const FundsPage = () => {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Fund | null>(null);

  const funds = useApi((signal) => api<{ data: Fund[] }>("/funds", { signal }), []);

  return (
    <>
      <PageHeader
        title="Funds"
        subtitle="Designations that contributions can be recorded against."
        actions={<Button onClick={() => setCreating(true)}>Add fund</Button>}
      />

      <Card>
        {funds.loading && <Spinner label="Loading funds" />}
        {funds.error && <ErrorBox message={funds.error} onRetry={funds.reload} />}

        {funds.data &&
          (funds.data.data.length === 0 ? (
            <EmptyState title="No funds yet" hint="Add one before recording contributions." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fund</Th>
                  <Th>Status</Th>
                  <Th>Contributions</Th>
                  <Th className="text-right">Total received</Th>
                  <Th>{""}</Th>
                </tr>
              </thead>
              <tbody>
                {funds.data.data.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">{f.name}</div>
                      {f.description && <div className="text-xs text-slate-500">{f.description}</div>}
                    </Td>
                    <Td>
                      {f.isActive ? <Badge tone="green">Active</Badge> : <Badge>Closed</Badge>}
                    </Td>
                    <Td className="text-slate-600">{f.contributionCount ?? 0}</Td>
                    <Td className="text-right font-medium text-slate-900">{fmtMoney(f.total)}</Td>
                    <Td>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(f)}>
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
      </Card>

      <Modal open={creating} title="Add a fund" onClose={() => setCreating(false)}>
        <FundForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            funds.reload();
          }}
        />
      </Modal>

      <Modal open={!!editing} title="Edit fund" onClose={() => setEditing(null)}>
        {editing && (
          <FundForm
            fund={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              funds.reload();
            }}
          />
        )}
      </Modal>
    </>
  );
};
