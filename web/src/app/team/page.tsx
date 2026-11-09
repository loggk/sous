"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Building2,
  Mail,
  Plus,
  MapPin,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  api,
  Company,
  TeamData,
  TeamMember,
  TeamInvitation,
  RestaurantSummary,
} from "@/lib/api";
import { useConfirm } from "@/context/ConfirmContext";

export default function TeamPage() {
  const { confirm, alert } = useConfirm();
  const [company, setCompany] = useState<Company | null>(null);
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteVenues, setInviteVenues] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editVenues, setEditVenues] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [newLocationCuisine, setNewLocationCuisine] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setActionError(null);
      const comp = await api.getCompany();
      setCompany(comp);

      // If user is not company owner, don't attempt to load full team data (avoids 403)
      if (!comp.is_owner) {
        setLoading(false);
        return;
      }

      const team = await api.getTeam();
      setTeamData(team);
      if (comp.restaurants.length > 0 && inviteVenues.length === 0) {
        setInviteVenues(comp.restaurants.map((r) => r.id));
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, [inviteVenues.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Invite Member
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      setInviting(true);
      setActionError(null);
      const res = await api.inviteTeamMember(inviteEmail.trim(), inviteVenues);
      setActionSuccess(res.message || `Successfully invited ${inviteEmail}`);
      setIsInviteOpen(false);
      setInviteEmail("");
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to invite team member");
    } finally {
      setInviting(false);
    }
  };

  // Handle Edit Member Venue Assignments
  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditVenues(member.assigned_restaurant_ids);
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    if (editVenues.length === 0) {
      setActionError("Team member must be assigned to at least one venue");
      return;
    }
    try {
      setSavingEdit(true);
      setActionError(null);
      await api.updateUserRestaurants(editingMember.id, editVenues);
      setActionSuccess(`Updated venue access for ${editingMember.email}`);
      setIsEditOpen(false);
      setEditingMember(null);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to update member venues");
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (member: TeamMember) => {
    const confirmed = await confirm({
      title: "Remove Team Member",
      message: `Are you sure you want to remove ${member.email} from the company? They will immediately lose access to all locations.`,
      confirmText: "Remove Member",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      setActionError(null);
      await api.removeTeamMember(member.id);
      setActionSuccess(`Removed ${member.email} from company`);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to remove member");
    }
  };

  // Handle Cancel Invite
  const handleCancelInvite = async (invite: TeamInvitation) => {
    const confirmed = await confirm({
      title: "Cancel Invitation",
      message: `Are you sure you want to cancel the invitation sent to ${invite.email}?`,
      confirmText: "Cancel Invite",
      cancelText: "Keep Invite",
      variant: "warning",
    });
    if (!confirmed) {
      return;
    }
    try {
      setActionError(null);
      await api.cancelInvitation(invite.id);
      setActionSuccess(`Canceled invitation for ${invite.email}`);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to cancel invitation");
    }
  };

  // Handle Add New Location
  const handleAddLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;
    try {
      setAddingLocation(true);
      setActionError(null);
      await api.addLocation({
        name: newLocationName.trim(),
        address: newLocationAddress.trim() || undefined,
        cuisine_type: newLocationCuisine.trim() || undefined,
      });
      setActionSuccess(`Added location "${newLocationName}" to company`);
      setIsAddLocationOpen(false);
      setNewLocationName("");
      setNewLocationAddress("");
      setNewLocationCuisine("");
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to add location");
    } finally {
      setAddingLocation(false);
    }
  };

  const toggleVenueSelection = (
    list: string[],
    setList: (val: string[]) => void,
    venueId: string
  ) => {
    if (list.includes(venueId)) {
      setList(list.filter((id) => id !== venueId));
    } else {
      setList([...list, venueId]);
    }
  };

  // Guard: If not company owner/admin, display access denied view
  if (!loading && company && !company.is_owner) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 shadow-xs">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Owner & Administrator Access Required
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          You currently have operator access to your assigned restaurants, but only company owners and administrators can invite new members, change venue assignments, or manage locations.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#1b2b4a] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer"
          >
            <span>Return to Spend Insights</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1b2b4a] text-white shadow-md dark:bg-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {company?.name || "Company & Team"}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-venue organization tenancy & operator access
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Assigned team members have full access to invoices, audits, and regional benchmarking for their venues.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddLocationOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>Add Location</span>
          </button>
          <button
            onClick={() => {
              if (company?.restaurants) {
                setInviteVenues(company.restaurants.map((r) => r.id));
              }
              setIsInviteOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#1b2b4a] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Invite Team Member</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="cursor-pointer text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid: Members & Venues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Team Members List (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Active Team Members ({teamData?.members.length || 0})
                </h2>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading team members...</div>
            ) : !teamData?.members || teamData.members.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No team members yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {teamData.members.map((member) => (
                  <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                          {member.email}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-slate-400 font-medium">Venues:</span>
                        {member.assigned_restaurants.length > 0 ? (
                          member.assigned_restaurants.map((venue) => (
                            <span
                              key={venue.id}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              <MapPin className="h-2.5 w-2.5 text-slate-400" />
                              {venue.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No assigned venues</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleOpenEdit(member)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                        title="Edit Venue Access"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit Access</span>
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 cursor-pointer transition-colors"
                        title="Remove Member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Invitations */}
          {teamData && teamData.invitations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
              <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pending Invitations ({teamData.invitations.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-400">Invited users automatically link when logging in</span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {teamData.invitations.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-4 sm:px-6">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {invite.email}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Assigned to {invite.restaurant_ids.length} venue(s)
                      </span>
                    </div>

                    <button
                      onClick={() => handleCancelInvite(invite)}
                      className="text-xs text-slate-500 hover:text-red-600 cursor-pointer font-medium"
                    >
                      Cancel Invite
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Company Locations Summary (1 Col) */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Company Venues ({company?.restaurants.length || 0})
                </h2>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {company?.restaurants.map((rest: RestaurantSummary) => (
                <div
                  key={rest.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {rest.name}
                    </span>
                    {rest.cuisine_type && (
                      <span className="rounded-sm bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {rest.cuisine_type}
                      </span>
                    )}
                  </div>
                  {rest.address && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{rest.address}</span>
                    </p>
                  )}
                </div>
              ))}

              <button
                onClick={() => setIsAddLocationOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Another Venue</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Invite Team Member */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                <span>Invite Team Member</span>
              </h3>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="manager@restaurant.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Assign Venues
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  {company?.restaurants.map((rest) => {
                    const checked = inviteVenues.includes(rest.id);
                    return (
                      <label
                        key={rest.id}
                        className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleVenueSelection(inviteVenues, setInviteVenues, rest.id)
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{rest.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                Team members will have full operator privileges to upload invoices, audit pricing, and view spatial benchmarks for all assigned venues.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim() || inviteVenues.length === 0}
                  className="rounded-lg bg-[#1b2b4a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2f4a7d] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer"
                >
                  {inviting ? "Inviting..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Venue Access */}
      {isEditOpen && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-blue-600" />
                <span>Edit Venue Access</span>
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <span className="text-xs text-slate-500">Member:</span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {editingMember.email}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Assigned Venues
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  {company?.restaurants.map((rest) => {
                    const checked = editVenues.includes(rest.id);
                    return (
                      <label
                        key={rest.id}
                        className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleVenueSelection(editVenues, setEditVenues, rest.id)
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{rest.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || editVenues.length === 0}
                  className="rounded-lg bg-[#1b2b4a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2f4a7d] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer"
                >
                  {savingEdit ? "Saving..." : "Save Assignments"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Location */}
      {isAddLocationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-600" />
                <span>Add Restaurant Location</span>
              </h3>
              <button
                onClick={() => setIsAddLocationOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddLocationSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Location / Venue Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Queen St Slice - Danforth"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Street Address
                </label>
                <input
                  type="text"
                  placeholder="456 Danforth Ave, Toronto, ON"
                  value={newLocationAddress}
                  onChange={(e) => setNewLocationAddress(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cuisine Type
                </label>
                <input
                  type="text"
                  placeholder="Pizzeria / Casual Dining"
                  value={newLocationCuisine}
                  onChange={(e) => setNewLocationCuisine(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddLocationOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLocation || !newLocationName.trim()}
                  className="rounded-lg bg-[#1b2b4a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2f4a7d] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer"
                >
                  {addingLocation ? "Adding..." : "Add Location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
