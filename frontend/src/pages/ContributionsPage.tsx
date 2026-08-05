import { useState } from "react";
import { api, ApiError, downloadCsv, type Paginated } from "../lib/api";
import { useApi, useDebounced } from "../hooks/useApi";
import { fmtDate, fmtMoney, fullName, titleCase, toDateInput } from "../lib/format";
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
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "../components/ui";
import type { Contribution, Fund, Member, PaymentMethod } from "../lib/types";

const METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CHEQUE", "IN_KIND"];

const ContributionForm = ({
  funds,
  members,
  onSaved,
  onCancel,
}: {
  funds: Fund[];
  members: Member[];
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState({
    amount: "",
    fundId: funds[0]?.id ?? "",
    memberId: "",
    receivedOn: toDateInput(new Date()),
    paymentMethod: "CASH" as PaymentMethod,
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api("/contributions", {
        method: "POST",
        body: {
          ...form,
          amount: Number(form.amount),
          memberId: form.memberId || null,
          notes: form.notes || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the contribution.");
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
        <Field label="Amount (ZMW)">
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Fund">
          <Select value={form.fundId} onChange={(e) => set("fundId", e.target.value)} required>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contributor" hint="Leave blank for anonymous / loose offering">
          <Select value={form.memberId} onChange={(e) => set("memberId", e.target.value)}>
            <option value="">Anonymous</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {fullName(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received on">
          <Input
            type="date"
            value={form.receivedOn}
            onChange={(e) => set("receivedOn", e.target.value)}
            required
          />
        </Field>
        <Field label="Payment method">
          <Select
            value={form.paymentMethod}
            onChange={(e) => set("paymentMethod", e.target.value as PaymentMethod)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        A receipt number is generated automatically and cannot be changed afterwards.
      </p>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Recording…" : "Record contribution"}
        </Button>
      </div>
    </form>
  );
};

export const ContributionsPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [fundId, setFundId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebounced(search);
  const query = {
    page,
    pageSize: 25,
    search: debouncedSearch,
    fundId: fundId || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const contributions = useApi(
    (signal) =>
      api<Paginated<Contribution> & { totals: { amount: string } }>("/contributions", {
        query,
        signal,
      }),
    [page, debouncedSearch, fundId, from, to],
  );

  const funds = useApi((signal) => api<{ data: Fund[] }>("/funds", { signal }), []);
  const members = useApi(
    (signal) => api<Paginated<Member>>("/members", { query: { pageSize: 100 }, signal }),
    [],
  );

  return (
    <>
      <PageHeader
        title="Contributions"
        subtitle="The giving ledger. Recording only — the system does not process payments."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCsv("/contributions/export", query)}>
              Export CSV
            </Button>
            <Button onClick={() => setCreating(true)}>Record contribution</Button>
          </>
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search receipt, name or notes…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={fundId}
            onChange={(e) => {
              setFundId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All funds</option>
            {funds.data?.data.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            aria-label="To date"
          />
        </div>

        {contributions.data && (
          <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Total for the current filter: </span>
            <strong className="text-slate-900">{fmtMoney(contributions.data.totals.amount)}</strong>
            <span className="text-slate-500"> across {contributions.data.meta.total} records</span>
          </div>
        )}

        {contributions.loading && <Spinner label="Loading ledger" />}
        {contributions.error && (
          <ErrorBox message={contributions.error} onRetry={contributions.reload} />
        )}

        {contributions.data &&
          (contributions.data.data.length === 0 ? (
            <EmptyState
              title="No contributions match those filters"
              hint="Clear the date range or search box."
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Receipt</Th>
                    <Th>Date</Th>
                    <Th>Contributor</Th>
                    <Th>Fund</Th>
                    <Th>Method</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.data.data.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td className="font-mono text-xs text-slate-500">{c.receiptNumber}</Td>
                      <Td className="text-slate-600">{fmtDate(c.receivedOn)}</Td>
                      <Td>
                        {c.member ? (
                          fullName(c.member)
                        ) : (
                          <span className="text-slate-400">Anonymous</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone="blue">{c.fund.name}</Badge>
                      </Td>
                      <Td className="text-slate-600">{titleCase(c.paymentMethod)}</Td>
                      <Td className="text-right font-medium text-slate-900">
                        {fmtMoney(c.amount, c.currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <Pagination
                page={contributions.data.meta.page}
                totalPages={contributions.data.meta.totalPages}
                total={contributions.data.meta.total}
                onChange={setPage}
              />
            </>
          ))}
      </Card>

      <Modal open={creating} title="Record a contribution" onClose={() => setCreating(false)}>
        <ContributionForm
          funds={funds.data?.data ?? []}
          members={members.data?.data ?? []}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            contributions.reload();
          }}
        />
      </Modal>
    </>
  );
};
