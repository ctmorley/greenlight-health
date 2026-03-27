"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { SettingsSkeleton } from "./settings-skeleton";

interface OrgData {
  id: string;
  name: string;
  type: string;
  npi: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
}

const orgTypeLabels: Record<string, string> = {
  imaging_center: "Imaging Center",
  surgical_center: "Surgical Center",
  hospital: "Hospital",
  multi_specialty: "Multi-Specialty",
};

export function OrganizationTab({ isAdmin }: { isAdmin: boolean }) {
  const { addToast } = useToast();
  const { update: updateSession } = useSession();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    fax: "",
    email: "",
    npi: "",
    taxId: "",
  });

  useEffect(() => {
    async function fetchOrg() {
      try {
        const res = await fetch("/api/settings/organization");
        if (!res.ok) {
          throw new Error("Failed to load organization data");
        }
        const data = await res.json();
        setOrg(data.organization);
        setForm({
          name: data.organization.name || "",
          address: data.organization.address || "",
          phone: data.organization.phone || "",
          fax: data.organization.fax || "",
          email: data.organization.email || "",
          npi: data.organization.npi || "",
          taxId: data.organization.taxId || "",
        });
      } catch (err) {
        addToast(err instanceof Error ? err.message : "Failed to load organization data", "error");
      } finally {
        setLoading(false);
      }
    }
    fetchOrg();
  }, [addToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      const data = await res.json();
      setOrg(data.organization);
      if (data.organization.name) {
        await updateSession({ organizationName: data.organization.name });
      }
      addToast("Organization settings saved successfully", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <Card variant="glass" padding="lg">
      <CardTitle className="mb-6">Organization Information</CardTitle>

      <div className="space-y-6">
        {org && (
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="info" size="md">{orgTypeLabels[org.type] || org.type}</Badge>
            <span className="text-xs text-text-muted">ID: {org.id}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Organization Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={!isAdmin}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={!isAdmin}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            disabled={!isAdmin}
          />
          <Input
            label="Fax"
            value={form.fax}
            onChange={(e) => setForm({ ...form, fax: e.target.value })}
            disabled={!isAdmin}
          />
          <Input
            label="NPI"
            value={form.npi}
            onChange={(e) => setForm({ ...form, npi: e.target.value })}
            disabled={!isAdmin}
          />
          <Input
            label="Tax ID"
            value={form.taxId}
            onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            disabled={!isAdmin}
          />
        </div>

        <div>
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            disabled={!isAdmin}
          />
        </div>

        {isAdmin && (
          <div className="flex justify-end pt-4 border-t border-white/10">
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              Save Changes
            </Button>
          </div>
        )}

        {!isAdmin && (
          <p className="text-xs text-text-muted pt-4 border-t border-white/10">
            Only administrators can edit organization settings.
          </p>
        )}
      </div>
    </Card>
  );
}
