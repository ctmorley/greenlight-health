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

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  title: string | null;
  npiNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "pa_coordinator", label: "PA Coordinator" },
  { value: "physician", label: "Physician" },
  { value: "viewer", label: "Viewer" },
];

const roleLabels: Record<string, string> = {
  admin: "Admin",
  pa_coordinator: "PA Coordinator",
  physician: "Physician",
  viewer: "Viewer",
};

const roleBadgeVariants: Record<string, "success" | "info" | "warning" | "default"> = {
  admin: "success",
  pa_coordinator: "info",
  physician: "warning",
  viewer: "default",
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const { addToast } = useToast();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "viewer",
    title: "",
    npiNumber: "",
  });
  const [addingUser, setAddingUser] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/users");
      if (!res.ok) {
        throw new Error("Failed to load users");
      }
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async () => {
    if (!newUserForm.email || !newUserForm.firstName || !newUserForm.lastName) {
      addToast("Email, first name, and last name are required", "error");
      return;
    }

    setAddingUser(true);
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }

      const data = await res.json();
      setUsers((prev) => [...prev, { ...data.user, lastLoginAt: null }]);
      setTempPassword(data.tempPassword);
      addToast(`User ${data.user.firstName} ${data.user.lastName} created successfully`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create user", "error");
    } finally {
      setAddingUser(false);
    }
  };

  const handleToggleActive = async (user: UserData) => {
    try {
      const res = await fetch("/api/settings/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, isActive: !user.isActive }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update user");
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
      );
      addToast(
        `User ${user.firstName} ${user.lastName} ${user.isActive ? "deactivated" : "activated"}`,
        "success"
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update user", "error");
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      const res = await fetch("/api/settings/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update role");
      }

      const data = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      setEditingUser(null);
      addToast("Role updated successfully", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to update role", "error");
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <>
      <Card variant="glass" padding="md">
        <div className="flex items-center justify-between mb-6">
          <CardTitle>Team Members</CardTitle>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNewUserForm({ email: "", firstName: "", lastName: "", role: "viewer", title: "", npiNumber: "" });
                setTempPassword(null);
                setShowAddModal(true);
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add User
            </Button>
          )}
        </div>

        {users.length === 0 ? (
          <EmptyState icon="👥" title="No users" description="No team members found." />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Last Login</th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((user) => (
                    <tr key={user.id} className={`transition-colors ${!user.isActive ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {user.firstName} {user.lastName}
                          </p>
                          {user.title && <p className="text-xs text-text-muted">{user.title}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">{user.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={roleBadgeVariants[user.role] || "default"} size="sm">
                          {roleLabels[user.role] || user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.isActive ? "success" : "default"} size="sm">
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-text-muted">{formatDate(user.lastLoginAt)}</span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingUser(user)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={user.isActive ? "danger" : "secondary"}
                              size="sm"
                              onClick={() => handleToggleActive(user)}
                            >
                              {user.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-white/5">
              {users.map((user) => (
                <div key={user.id} className={`p-4 ${!user.isActive ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-text-muted">{user.email}</p>
                    </div>
                    <Badge variant={user.isActive ? "success" : "default"} size="sm">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={roleBadgeVariants[user.role] || "default"} size="sm">
                      {roleLabels[user.role] || user.role}
                    </Badge>
                    <span className="text-xs text-text-muted">Last login: {formatDate(user.lastLoginAt)}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 mt-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingUser(user)}>
                        Edit
                      </Button>
                      <Button
                        variant={user.isActive ? "danger" : "secondary"}
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Add User Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New User" size="md">
        {tempPassword ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-sm text-emerald-300 font-medium mb-2">User created successfully!</p>
              <p className="text-xs text-text-secondary mb-3">
                Share this temporary password with the new user. They should change it upon first login.
              </p>
              <div className="flex items-center gap-2 bg-dark-800 rounded-lg p-3">
                <code className="text-sm font-mono text-emerald-400 flex-1">{tempPassword}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPassword);
                    addToast("Password copied to clipboard", "info");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name *"
                value={newUserForm.firstName}
                onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
              />
              <Input
                label="Last Name *"
                value={newUserForm.lastName}
                onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
              />
            </div>
            <Input
              label="Email *"
              type="email"
              value={newUserForm.email}
              onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
            />
            <Select
              label="Role *"
              options={ROLE_OPTIONS}
              value={newUserForm.role}
              onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
            />
            <Input
              label="Title"
              value={newUserForm.title}
              onChange={(e) => setNewUserForm({ ...newUserForm, title: e.target.value })}
              placeholder="e.g., Radiology Technician"
            />
            <Input
              label="NPI Number"
              value={newUserForm.npiNumber}
              onChange={(e) => setNewUserForm({ ...newUserForm, npiNumber: e.target.value })}
              placeholder="Optional"
            />
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAddUser} isLoading={addingUser}>
                Create User
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={editingUser ? `Edit ${editingUser.firstName} ${editingUser.lastName}` : "Edit User"}
        size="sm"
      >
        {editingUser && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-text-secondary mb-1">Email</p>
              <p className="text-sm text-text-primary">{editingUser.email}</p>
            </div>
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              value={editingUser.role}
              onChange={(e) => handleUpdateRole(editingUser.id, e.target.value)}
            />
            <div className="flex justify-end pt-4 border-t border-white/10">
              <Button variant="secondary" onClick={() => setEditingUser(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
