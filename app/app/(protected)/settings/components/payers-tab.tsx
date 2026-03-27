"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { SettingsSkeleton } from "./settings-skeleton";

interface PayerData {
  id: string;
  name: string;
  payerId: string;
  type: string;
  phone: string | null;
  fax: string | null;
  portalUrl: string | null;
  electronicSubmission: boolean;
  avgResponseDays: number;
  rbmVendor: string | null;
  isActive: boolean;
  _count?: { rules: number };
}

interface PayerRuleData {
  id: string;
  serviceCategory: string;
  cptCode: string | null;
  requiresPA: boolean;
}

const payerTypeLabels: Record<string, string> = {
  commercial: "Commercial",
  medicare: "Medicare",
  medicaid: "Medicaid",
  tricare: "TRICARE",
};

const rbmVendorLabels: Record<string, string> = {
  evicore: "EviCore",
  carelon: "Carelon",
  nia: "NIA",
  direct: "Direct",
};

export function PayersTab() {
  const { addToast } = useToast();
  const [payers, setPayers] = useState<PayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedPayer, setSelectedPayer] = useState<PayerData | null>(null);
  const [rules, setRules] = useState<PayerRuleData[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [editingPayer, setEditingPayer] = useState(false);
  const [payerForm, setPayerForm] = useState({ phone: "", fax: "", portalUrl: "", avgResponseDays: 5, electronicSubmission: false, rbmVendor: "" as string });
  const [savingPayer, setSavingPayer] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [newRule, setNewRule] = useState({ serviceCategory: "imaging", cptCode: "", requiresPA: true });
  const [savingRule, setSavingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<PayerRuleData | null>(null);
  const [editRuleForm, setEditRuleForm] = useState({ serviceCategory: "imaging", cptCode: "", requiresPA: true });
  const [savingEditRule, setSavingEditRule] = useState(false);

  const fetchPayers = useCallback(async (includeInactive: boolean) => {
    try {
      const params = includeInactive ? "?includeInactive=true" : "";
      const res = await fetch(`/api/payers${params}`);
      if (!res.ok) {
        throw new Error("Failed to load payers");
      }
      const data = await res.json();
      setPayers(data.payers);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load payers", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchPayers(showInactive);
  }, [showInactive, fetchPayers]);

  const handleSelectPayer = async (payer: PayerData) => {
    setSelectedPayer(payer);
    setEditingPayer(false);
    setAddingRule(false);
    setPayerForm({
      phone: payer.phone || "",
      fax: payer.fax || "",
      portalUrl: payer.portalUrl || "",
      avgResponseDays: payer.avgResponseDays,
      electronicSubmission: payer.electronicSubmission,
      rbmVendor: payer.rbmVendor || "",
    });
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/payers/${payer.id}/rules`);
      if (!res.ok) {
        throw new Error("Failed to load payer rules");
      }
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load payer rules", "error");
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  };

  const handleSavePayer = async () => {
    if (!selectedPayer) return;
    setSavingPayer(true);
    try {
      const res = await fetch(`/api/payers/${selectedPayer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: payerForm.phone || null,
          fax: payerForm.fax || null,
          portalUrl: payerForm.portalUrl || null,
          avgResponseDays: payerForm.avgResponseDays,
          electronicSubmission: payerForm.electronicSubmission,
          rbmVendor: payerForm.rbmVendor || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save payer");
      }
      const data = await res.json();
      setPayers((prev) => prev.map((p) => (p.id === selectedPayer.id ? data.payer : p)));
      setSelectedPayer(data.payer);
      setEditingPayer(false);
      addToast("Payer details saved successfully", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save payer", "error");
    } finally {
      setSavingPayer(false);
    }
  };

  const handleAddRule = async () => {
    if (!selectedPayer) return;
    setSavingRule(true);
    try {
      const res = await fetch(`/api/payers/${selectedPayer.id}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCategory: newRule.serviceCategory,
          cptCode: newRule.cptCode || null,
          requiresPA: newRule.requiresPA,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add rule");
      }
      const data = await res.json();
      setRules((prev) => [...prev, { id: data.rule.id, serviceCategory: data.rule.serviceCategory, cptCode: data.rule.cptCode, requiresPA: data.rule.requiresPA }]);
      setNewRule({ serviceCategory: "imaging", cptCode: "", requiresPA: true });
      setAddingRule(false);
      addToast("Rule added successfully", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to add rule", "error");
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!selectedPayer) return;
    try {
      const res = await fetch(`/api/payers/${selectedPayer.id}/rules/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      addToast("Rule deleted", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete rule", "error");
    }
  };

  const handleStartEditRule = (rule: PayerRuleData) => {
    setEditingRule(rule);
    setEditRuleForm({
      serviceCategory: rule.serviceCategory,
      cptCode: rule.cptCode || "",
      requiresPA: rule.requiresPA,
    });
  };

  const handleSaveEditRule = async () => {
    if (!selectedPayer || !editingRule) return;
    setSavingEditRule(true);
    try {
      const res = await fetch(`/api/payers/${selectedPayer.id}/rules/${editingRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCategory: editRuleForm.serviceCategory,
          cptCode: editRuleForm.cptCode || null,
          requiresPA: editRuleForm.requiresPA,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update rule");
      }
      const data = await res.json();
      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? { id: data.rule.id, serviceCategory: data.rule.serviceCategory, cptCode: data.rule.cptCode, requiresPA: data.rule.requiresPA }
            : r
        )
      );
      setEditingRule(null);
      addToast("Rule updated successfully", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update rule", "error");
    } finally {
      setSavingEditRule(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <>
      <Card variant="glass" padding="md">
        <div className="flex items-center justify-between mb-6">
          <CardTitle>Payer Configuration</CardTitle>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30"
            />
            Show Inactive
          </label>
        </div>

        {payers.length === 0 ? (
          <EmptyState icon="🏦" title="No payers" description="No payer records found." />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Payer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">RBM Vendor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Avg Response</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">E-Submit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Rules</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payers.map((payer) => (
                    <tr key={payer.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{payer.name}</p>
                          <p className="text-xs text-text-muted font-mono">{payer.payerId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info" size="sm">{payerTypeLabels[payer.type] || payer.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">
                          {payer.rbmVendor ? rbmVendorLabels[payer.rbmVendor] || payer.rbmVendor : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">{payer.avgResponseDays} days</span>
                      </td>
                      <td className="px-4 py-3">
                        {payer.electronicSubmission ? (
                          <Badge variant="success" size="sm">Yes</Badge>
                        ) : (
                          <Badge variant="default" size="sm">No</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-text-secondary">
                          {payer._count?.rules ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={payer.isActive ? "success" : "default"} size="sm">
                          {payer.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleSelectPayer(payer)}>
                          Edit / View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-white/5">
              {payers.map((payer) => (
                <div
                  key={payer.id}
                  className="p-4 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => handleSelectPayer(payer)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{payer.name}</p>
                      <p className="text-xs text-text-muted font-mono">{payer.payerId}</p>
                    </div>
                    <Badge variant={payer.isActive ? "success" : "default"} size="sm">
                      {payer.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="info" size="sm">{payerTypeLabels[payer.type] || payer.type}</Badge>
                    {payer.rbmVendor && (
                      <Badge variant="default" size="sm">{rbmVendorLabels[payer.rbmVendor] || payer.rbmVendor}</Badge>
                    )}
                    <span className="text-xs text-text-muted">
                      {payer.avgResponseDays}d avg · {payer._count?.rules ?? 0} rules
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Payer Detail / Edit Modal */}
      <Modal
        isOpen={!!selectedPayer}
        onClose={() => setSelectedPayer(null)}
        title={selectedPayer ? `${selectedPayer.name}` : "Payer Details"}
        size="lg"
      >
        {selectedPayer && (
          <div className="space-y-4">
            {/* Payer Info — View / Edit */}
            {editingPayer ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Phone" value={payerForm.phone} onChange={(e) => setPayerForm({ ...payerForm, phone: e.target.value })} />
                  <Input label="Fax" value={payerForm.fax} onChange={(e) => setPayerForm({ ...payerForm, fax: e.target.value })} />
                </div>
                <Input label="Portal URL" value={payerForm.portalUrl} onChange={(e) => setPayerForm({ ...payerForm, portalUrl: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Avg Response Days" type="number" value={String(payerForm.avgResponseDays)} onChange={(e) => setPayerForm({ ...payerForm, avgResponseDays: parseInt(e.target.value) || 0 })} />
                  <Select
                    label="RBM Vendor"
                    options={[
                      { value: "", label: "None" },
                      { value: "evicore", label: "EviCore" },
                      { value: "carelon", label: "Carelon" },
                      { value: "nia", label: "NIA" },
                      { value: "direct", label: "Direct" },
                    ]}
                    value={payerForm.rbmVendor}
                    onChange={(e) => setPayerForm({ ...payerForm, rbmVendor: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payerForm.electronicSubmission}
                    onChange={(e) => setPayerForm({ ...payerForm, electronicSubmission: e.target.checked })}
                    className="rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30"
                  />
                  Electronic Submission
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingPayer(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleSavePayer} isLoading={savingPayer}>Save Payer</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-text-muted text-xs">Phone</p>
                    <p className="text-text-primary">{selectedPayer.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">Fax</p>
                    <p className="text-text-primary">{selectedPayer.fax || "—"}</p>
                  </div>
                  {selectedPayer.portalUrl && (
                    <div className="col-span-2">
                      <p className="text-text-muted text-xs">Portal URL</p>
                      <a href={selectedPayer.portalUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 text-sm">
                        {selectedPayer.portalUrl}
                      </a>
                    </div>
                  )}
                  <div>
                    <p className="text-text-muted text-xs">Avg Response</p>
                    <p className="text-text-primary">{selectedPayer.avgResponseDays} days</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs">RBM Vendor</p>
                    <p className="text-text-primary">{selectedPayer.rbmVendor ? rbmVendorLabels[selectedPayer.rbmVendor] || selectedPayer.rbmVendor : "—"}</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => setEditingPayer(true)}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                    </svg>
                    Edit Details
                  </Button>
                </div>
              </>
            )}

            {/* Rules */}
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-text-primary">
                  PA Requirement Rules ({loadingRules ? "..." : rules.length})
                </h4>
                <Button variant="ghost" size="sm" onClick={() => setAddingRule(!addingRule)}>
                  {addingRule ? "Cancel" : "+ Add Rule"}
                </Button>
              </div>

              {/* Add Rule Form */}
              {addingRule && (
                <div className="p-3 mb-3 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Select
                      label="Category"
                      options={[
                        { value: "imaging", label: "Imaging" },
                        { value: "surgical", label: "Surgical" },
                        { value: "medical", label: "Medical" },
                      ]}
                      value={newRule.serviceCategory}
                      onChange={(e) => setNewRule({ ...newRule, serviceCategory: e.target.value })}
                    />
                    <Input
                      label="CPT Code"
                      placeholder="e.g. 70553 (blank=all)"
                      value={newRule.cptCode}
                      onChange={(e) => setNewRule({ ...newRule, cptCode: e.target.value })}
                    />
                    <Select
                      label="PA Required?"
                      options={[
                        { value: "true", label: "Yes" },
                        { value: "false", label: "No" },
                      ]}
                      value={String(newRule.requiresPA)}
                      onChange={(e) => setNewRule({ ...newRule, requiresPA: e.target.value === "true" })}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="primary" size="sm" onClick={handleAddRule} isLoading={savingRule}>Add Rule</Button>
                  </div>
                </div>
              )}

              {loadingRules ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse h-10 bg-white/5 rounded-lg" />
                  ))}
                </div>
              ) : rules.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">No rules configured</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {rules.map((rule) => (
                    <div key={rule.id}>
                      {editingRule?.id === rule.id ? (
                        <div className="p-3 rounded-lg bg-white/10 border border-white/10 space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <Select
                              label="Category"
                              options={[
                                { value: "imaging", label: "Imaging" },
                                { value: "surgical", label: "Surgical" },
                                { value: "medical", label: "Medical" },
                              ]}
                              value={editRuleForm.serviceCategory}
                              onChange={(e) => setEditRuleForm({ ...editRuleForm, serviceCategory: e.target.value })}
                            />
                            <Input
                              label="CPT Code"
                              placeholder="e.g. 70553 (blank=all)"
                              value={editRuleForm.cptCode}
                              onChange={(e) => setEditRuleForm({ ...editRuleForm, cptCode: e.target.value })}
                            />
                            <Select
                              label="PA Required?"
                              options={[
                                { value: "true", label: "Yes" },
                                { value: "false", label: "No" },
                              ]}
                              value={String(editRuleForm.requiresPA)}
                              onChange={(e) => setEditRuleForm({ ...editRuleForm, requiresPA: e.target.value === "true" })}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingRule(null)}>Cancel</Button>
                            <Button variant="primary" size="sm" onClick={handleSaveEditRule} isLoading={savingEditRule}>Save</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 text-sm">
                          <div className="flex items-center gap-3">
                            <Badge variant="info" size="sm">
                              {rule.serviceCategory}
                            </Badge>
                            {rule.cptCode ? (
                              <span className="font-mono text-xs text-text-secondary">{rule.cptCode}</span>
                            ) : (
                              <span className="text-xs text-text-muted italic">All codes</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={rule.requiresPA ? "warning" : "success"} size="sm">
                              {rule.requiresPA ? "PA Required" : "No PA"}
                            </Badge>
                            <button
                              onClick={() => handleStartEditRule(rule)}
                              className="p-1 text-text-muted hover:text-emerald-400 transition-colors"
                              title="Edit rule"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1 text-text-muted hover:text-red-400 transition-colors"
                              title="Delete rule"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
