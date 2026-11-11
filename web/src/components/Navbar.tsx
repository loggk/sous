"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  User,
  Users,
  MapPin,
  ChevronDown,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api, Company } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadCompanyData = async (emailOverride?: string | null) => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const currentEmail = emailOverride !== undefined ? emailOverride : data.user?.email || null;
      if (!currentEmail) {
        setCompany(null);
        setActiveRestaurantId(null);
        return;
      }

      const comp = await api.getCompany();
      setCompany(comp);
      const stored = typeof window !== "undefined" ? localStorage.getItem("sous_active_restaurant_id") : null;
      if (stored && comp.restaurants.some((r) => r.id === stored)) {
        setActiveRestaurantId(stored);
      } else if (comp.restaurants.length > 0) {
        const defaultId = comp.assigned_restaurant_ids[0] || comp.restaurants[0].id;
        setActiveRestaurantId(defaultId);
        if (typeof window !== "undefined") {
          localStorage.setItem("sous_active_restaurant_id", defaultId);
        }
      }
    } catch {
      // offline / not yet initialized
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        const email = data.user?.email || null;
        setUserEmail(email);
        if (email) {
          loadCompanyData(email);
        } else {
          setCompany(null);
          setActiveRestaurantId(null);
        }
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
        const email = session?.user?.email || null;
        setUserEmail(email);
        if (email) {
          loadCompanyData(email);
        } else {
          setCompany(null);
          setActiveRestaurantId(null);
        }
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    } catch {
      // Supabase credentials not set yet
    }
  }, []);

  const handleSelectRestaurant = (restaurantId: string) => {
    setActiveRestaurantId(restaurantId);
    if (typeof window !== "undefined") {
      localStorage.setItem("sous_active_restaurant_id", restaurantId);
      window.dispatchEvent(new CustomEvent("sous_restaurant_changed", { detail: restaurantId }));
    }
    setDropdownOpen(false);
    router.refresh();
  };

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUserEmail(null);
      setCompany(null);
      setActiveRestaurantId(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("sous_active_restaurant_id");
      }
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  }

  const isOwner = Boolean(userEmail && (company?.is_owner ?? true));

  const navItems = [
    { name: "Insights", href: "/" },
    { name: "Benchmarks", href: "/benchmarks" },
    { name: "Invoices", href: "/invoices" },
    { name: "Item Mapping", href: "/review" },
    ...(isOwner ? [{ name: "Team", href: "/team" }] : []),
  ];

  const activeVenue = company?.restaurants.find((r) => r.id === activeRestaurantId) || company?.restaurants[0];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-rule bg-paper-raised">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8 lg:gap-10">
          {/* Logo */}
          <Link href="/" className="flex items-center" title="Sous">
            <Image
              src="/logo.png"
              alt="Sous"
              width={45}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>

          {/* Tracked uppercase, underlined on the current page: the logo's
              COLLECTIVE lettering used as navigation. */}
          <nav className="hidden md:flex items-center gap-7">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`font-display text-[11px] uppercase tracking-[0.14em] border-b-2 pb-1 transition-colors ${
                    isActive
                      ? "font-bold text-ink border-ink"
                      : "font-semibold text-ink-muted border-transparent hover:text-ink"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Company & Location Selector - only shown when authenticated */}
          {userEmail && company && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                className="flex min-h-11 items-center gap-2.5 rounded-full border border-rule bg-panel py-1.5 pl-2.5 pr-4 text-left transition-colors hover:border-edge cursor-pointer"
              >
                <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[11px] font-bold text-on-ink">
                  {(company?.name || "S").charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col text-left leading-tight">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    {company?.name || "Queen St Hospitality"}
                  </span>
                  <span className="truncate max-w-[130px] text-[13px] font-semibold text-ink sm:max-w-[180px]">
                    {activeVenue?.name || "Queen St Slice Co."}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded border border-rule bg-panel p-2 shadow-lg">
                  <div className="border-b border-rule-soft px-3 py-2">
                    <p className="label-caps">Company locations</p>
                    <p className="truncate text-xs font-medium text-ink-soft">
                      {company?.name}
                    </p>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {company?.restaurants.map((rest) => {
                      const isSelected = rest.id === activeVenue?.id;
                      const isAssigned =
                        company.assigned_restaurant_ids.length === 0 ||
                        company.assigned_restaurant_ids.includes(rest.id);

                      return (
                        <button
                          key={rest.id}
                          disabled={!isAssigned}
                          onClick={() => handleSelectRestaurant(rest.id)}
                          className={`flex w-full cursor-pointer items-center justify-between rounded px-3 py-2 text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-accent-wash font-semibold text-ink"
                              : isAssigned
                              ? "text-ink-soft hover:bg-chip"
                              : "cursor-not-allowed text-ink-muted opacity-40"
                          }`}
                        >
                          <div className="flex flex-col truncate pr-2">
                            <span className="truncate">{rest.name}</span>
                            {rest.address && (
                              <span className="flex items-center gap-1 truncate text-[10px] text-ink-muted">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                {rest.address}
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-accent" />}
                        </button>
                      );
                    })}
                  </div>
                  {isOwner && (
                    <div className="border-t border-rule-soft p-1">
                      <Link
                        href="/team"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-chip hover:text-ink"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>Manage Team & Locations</span>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Light / Dark Mode Toggle */}
          <ThemeToggle />

          {userEmail ? (
            <button
              onClick={handleSignOut}
              title={`Sign out (${userEmail})`}
              aria-label="Sign out"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-rule bg-panel text-ink-muted transition-colors hover:border-edge hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/login" title="Sign in" className="pill-primary">
              <User className="h-3.5 w-3.5" />
              <span>Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

