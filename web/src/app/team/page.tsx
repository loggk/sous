"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Mail, MapPin, ShieldAlert, Trash2, X } from "lucide-react";
import {
  api,
  Company,
  TeamData,
  TeamMember,
  TeamInvitation,
  RestaurantSummary,
} from "@/lib/api";
import { useConfirm } from "@/context/ConfirmContext";

function initials(email: string) {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

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
      setActionError(err.message || "Couldn't load your team.");
    } finally {
      setLoading(false);
    }
  }, [inviteVenues.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      setInviting(true);
      setActionError(null);
      const res = await api.inviteTeamMember(inviteEmail.trim(), inviteVenues);
      setActionSuccess(res.message || `Invite sent to ${inviteEmail}`);
      setIsInviteOpen(false);
      setInviteEmail("");
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Couldn't send that invite.");
    } finally {
      setInviting(false);
    }
  };

  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditVenues(member.assigned_restaurant_ids);
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    if (editVenues.length === 0) {
      setActionError("Everyone needs at least one venue.");
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
      setActionError(err.message || "Couldn't update their venues.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    const confirmed = await confirm({
      title: "Remove this person?",
      message: `${member.email} loses access to every location straight away.`,
      confirmText: "Remove them",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      setActionError(null);
      await api.removeTeamMember(member.id);
      setActionSuccess(`Removed ${member.email}`);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Couldn't remove them.");
    }
  };

  const handleCancelInvite = async (invite: TeamInvitation) => {
    const confirmed = await confirm({
      title: "Cancel this invite?",
      message: `${invite.email} won't be able to join with it any more.`,
      confirmText: "Cancel invite",
      cancelText: "Keep it",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      setActionError(null);
      await api.cancelInvitation(invite.id);
      setActionSuccess(`Cancelled the invite for ${invite.email}`);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Couldn't cancel that invite.");
    }
  };

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
      setActionSuccess(`Added “${newLocationName}”`);
      setIsAddLocationOpen(false);
      setNewLocationName("");
      setNewLocationAddress("");
      setNewLocationCuisine("");
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Couldn't add that location.");
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

  // Guard: operators without owner rights
  if (!loading && company && !company.is_owner) {
    return (
      <div className="mx-auto max-w-2xl py-20">
        <ShieldAlert className="h-8 w-8 text-over" />
        <h1 className="display-xl mt-4 text-3xl">This part is for owners</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          You have full operator access to your own venues. Inviting people, changing venue access
          and adding locations stay with the company owner.
        </p>
        <Link href="/" className="pill-primary mt-6 no-underline">
          Back to Insights
        </Link>
      </div>
    );
  }

  const venueCount = company?.restaurants.length ?? 0;
  const memberCount = teamData?.members.length ?? 0;
  const inviteCount = teamData?.invitations.length ?? 0;

  return (
    <div>
      {/* Page head */}
      <div className="flex flex-wrap items-end justify-between gap-6 pb-7">
        <div>
          <span className="eyebrow">Company</span>
          <h1 className="display-xl mt-2 text-4xl sm:text-[46px]">
            {company?.name || "Your company"}
          </h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-soft">
            Everyone here sees invoices, audits and benchmarks for the venues they are assigned to
            and nothing for the ones they are not.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              if (company?.restaurants) {
                setInviteVenues(company.restaurants.map((r) => r.id));
              }
              setIsInviteOpen(true);
            }}
            className="pill-primary"
          >
            Invite someone
          </button>
          <button type="button" onClick={() => setIsAddLocationOpen(true)} className="pill-secondary">
            Add a location
          </button>
        </div>
      </div>

      {/* Alerts */}
      {actionError && (
        <div className="mb-5 rounded bg-over-wash px-4 py-3.5 text-sm text-over-ink">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded bg-under-wash px-4 py-3.5 text-sm text-under-ink">
          <span>{actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            aria-label="Dismiss"
            className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary */}
      <section className="section-open section-close grid grid-cols-1 sm:grid-cols-3">
        <div className="py-6 pr-7">
          <span className="label-caps">Venues</span>
          <div className="num display-sm mt-2 text-[27px]">{venueCount}</div>
          <p className="mt-1.5 text-xs text-ink-muted">Each benchmarks against its own neighbourhood</p>
        </div>
        <div className="border-rule px-7 py-6 sm:border-l">
          <span className="label-caps">People with access</span>
          <div className="num display-sm mt-2 text-[27px]">{memberCount}</div>
          <p className="mt-1.5 text-xs text-ink-muted">Owner plus operators</p>
        </div>
        <div className="border-rule py-6 pl-7 sm:border-l">
          <span className="label-caps">Waiting to join</span>
          <div className="num display-sm mt-2 text-[27px]">{inviteCount}</div>
          <p className="mt-1.5 text-xs text-ink-muted">Linked automatically on first sign-in</p>
        </div>
      </section>

      <section className="flex flex-wrap items-start gap-12 pt-9">
        {/* People */}
        <div className="min-w-0 flex-[999_1_520px]">
          <h2 className="display-sm text-xl">People</h2>
          <p className="mb-4 mt-1.5 text-[13px] text-ink-muted">
            Access is per venue. Changes take effect on their next page load.
          </p>

          {loading ? (
            <p className="py-10 text-center text-sm text-ink-soft">Loading your team…</p>
          ) : !teamData?.members || teamData.members.length === 0 ? (
            <p className="border-t border-rule py-10 text-center text-sm text-ink-soft">
              Nobody else has access yet.
            </p>
          ) : (
            <div className="border-t border-rule">
              {teamData.members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-rule-soft py-4"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip font-display text-sm font-bold text-ink">
                      {initials(member.email)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{member.email}</span>
                        {member.role && (
                          <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-on-ink">
                            {member.role}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {member.assigned_restaurants.length > 0 ? (
                          member.assigned_restaurants.map((venue) => (
                            <span
                              key={venue.id}
                              className="rounded-sm bg-chip px-2 py-1 text-[11.5px] text-ink"
                            >
                              {venue.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs italic text-ink-muted">No venues assigned</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(member)}
                      className="min-h-11 cursor-pointer rounded-full border border-edge px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-panel"
                    >
                      Change venues
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member)}
                      aria-label={`Remove ${member.email}`}
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors hover:text-over-ink"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {teamData && teamData.invitations.length > 0 && (
            <>
              <h3 className="display-sm mt-8 text-[11px] uppercase tracking-[0.18em]">
                Waiting to join
              </h3>
              <div className="mt-3 border-t border-rule">
                {teamData.invitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <Mail className="h-5 w-5 shrink-0 text-ink-muted" />
                      <div className="min-w-0">
                        <span className="block text-[14.5px] font-semibold text-ink">
                          {invite.email}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {invite.restaurant_ids.length}{" "}
                          {invite.restaurant_ids.length === 1 ? "venue" : "venues"} assigned
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelInvite(invite)}
                      className="min-h-11 cursor-pointer px-2 text-[13px] font-semibold text-over-ink hover:underline"
                    >
                      Cancel invite
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Venues */}
        <div className="min-w-0 max-w-[380px] flex-[1_1_300px]">
          <h2 className="display-sm text-xl">Venues</h2>
          <p className="mb-4 mt-1.5 text-[13px] text-ink-muted">
            Each one benchmarks against the kitchens around its own address.
          </p>

          <div className="border-t border-rule">
            {company?.restaurants.map((rest: RestaurantSummary) => (
              <div key={rest.id} className="border-b border-rule-soft py-4">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="text-[15px] font-bold text-ink">{rest.name}</span>
                  {rest.cuisine_type && (
                    <span className="shrink-0 rounded-sm bg-chip px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                      {rest.cuisine_type}
                    </span>
                  )}
                </div>
                {rest.address && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{rest.address}</span>
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsAddLocationOpen(true)}
            className="mt-4 min-h-12 w-full cursor-pointer rounded border border-dashed border-edge text-[13.5px] font-semibold text-ink transition-colors hover:bg-panel"
          >
            + Add another location
          </button>
        </div>
      </section>

      {/* Invite */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-rule bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-rule-soft pb-4">
              <div>
                <span className="eyebrow">Access</span>
                <h3 className="display-sm mt-1.5 text-lg">Invite someone</h3>
              </div>
              <button
                onClick={() => setIsInviteOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="mt-5 space-y-5">
              <div>
                <label htmlFor="invite-email" className="label-caps block pb-2">
                  Their email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="manager@restaurant.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="field"
                />
              </div>

              <fieldset className="m-0 border-0 p-0">
                <legend className="label-caps pb-2.5">Which venues</legend>
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {company?.restaurants.map((rest) => (
                    <label
                      key={rest.id}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-edge px-4 text-[13.5px] text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={inviteVenues.includes(rest.id)}
                        onChange={() => toggleVenueSelection(inviteVenues, setInviteVenues, rest.id)}
                        className="h-4 w-4 accent-[var(--ink)]"
                      />
                      {rest.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className="text-[13px] leading-relaxed text-ink-soft">
                They&rsquo;ll set their own password and land straight on the venues you tick, with
                full operator access to upload invoices and read benchmarks.
              </p>

              <div className="flex items-center justify-end gap-3 border-t border-rule-soft pt-4">
                <button type="button" onClick={() => setIsInviteOpen(false)} className="pill-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim() || inviteVenues.length === 0}
                  className="pill-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviting ? "Sending…" : "Send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit venue access */}
      {isEditOpen && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-rule bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-rule-soft pb-4">
              <div className="min-w-0">
                <span className="eyebrow">Access</span>
                <h3 className="display-sm mt-1.5 truncate text-lg">{editingMember.email}</h3>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-5 space-y-5">
              <fieldset className="m-0 border-0 p-0">
                <legend className="label-caps pb-2.5">Venues they can see</legend>
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {company?.restaurants.map((rest) => (
                    <label
                      key={rest.id}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-edge px-4 text-[13.5px] text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={editVenues.includes(rest.id)}
                        onChange={() => toggleVenueSelection(editVenues, setEditVenues, rest.id)}
                        className="h-4 w-4 accent-[var(--ink)]"
                      />
                      {rest.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-3 border-t border-rule-soft pt-4">
                <button type="button" onClick={() => setIsEditOpen(false)} className="pill-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || editVenues.length === 0}
                  className="pill-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingEdit ? "Saving…" : "Save access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add location */}
      {isAddLocationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded border border-rule bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-rule-soft pb-4">
              <div>
                <span className="eyebrow">Company</span>
                <h3 className="display-sm mt-1.5 text-lg">Add a location</h3>
              </div>
              <button
                onClick={() => setIsAddLocationOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddLocationSubmit} className="mt-5 space-y-5">
              <div>
                <label htmlFor="loc-name" className="label-caps block pb-2">
                  Venue name
                </label>
                <input
                  id="loc-name"
                  type="text"
                  required
                  placeholder="Queen St Slice, Danforth"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="field"
                />
              </div>

              <div>
                <label htmlFor="loc-address" className="label-caps block pb-2">
                  Street address
                </label>
                <input
                  id="loc-address"
                  type="text"
                  placeholder="456 Danforth Ave, Toronto, ON"
                  value={newLocationAddress}
                  onChange={(e) => setNewLocationAddress(e.target.value)}
                  className="field"
                />
                <p className="mt-2 text-xs text-ink-muted">
                  This is what decides which kitchens it benchmarks against.
                </p>
              </div>

              <div>
                <label htmlFor="loc-cuisine" className="label-caps block pb-2">
                  Kind of place
                </label>
                <input
                  id="loc-cuisine"
                  type="text"
                  placeholder="Pizzeria, casual dining…"
                  value={newLocationCuisine}
                  onChange={(e) => setNewLocationCuisine(e.target.value)}
                  className="field"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-rule-soft pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddLocationOpen(false)}
                  className="pill-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLocation || !newLocationName.trim()}
                  className="pill-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingLocation ? "Adding…" : "Add location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
