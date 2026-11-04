"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Scale,
  Receipt,
  Sparkles,
  TrendingUp,
  LogOut,
  User,
  Users,
  Building2,
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

  const loadCompanyData = async () => {
    try {
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
    loadCompanyData();

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
        if (data.user?.email) {
          setUserEmail(data.user.email);
        }
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
        setUserEmail(session?.user?.email || null);
        loadCompanyData();
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
      if (typeof window !== "undefined") {
        localStorage.removeItem("sous_active_restaurant_id");
      }
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  }

  const isOwner = company?.is_owner ?? true;

  const navItems = [
    { name: "Insights", href: "/", icon: TrendingUp },
    { name: "Benchmarks", href: "/benchmarks", icon: Scale },
    { name: "Invoices", href: "/invoices", icon: Receipt },
    { name: "Item Mapping", href: "/review", icon: Sparkles },
    ...(isOwner ? [{ name: "Team", href: "/team", icon: Users }] : []),
  ];

  const activeVenue = company?.restaurants.find((r) => r.id === activeRestaurantId) || company?.restaurants[0];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-[#0b1324]/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 lg:gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center group" title="Sous">
            <div className="relative flex items-center transition-transform group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="Sous"
                width={45}
                height={40}
                className="h-10 w-auto object-contain"
                priority
              />
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#f0f4fa] text-[#1b2b4a] font-semibold shadow-2xs dark:bg-[#1a2c4e] dark:text-blue-100"
                      : "text-slate-600 hover:bg-[#f6f8fc] hover:text-[#1b2b4a] dark:text-slate-400 dark:hover:bg-[#131f37] dark:hover:text-white"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-[#2f4a7d] dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Company & Location Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-left transition-all hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-800 cursor-pointer"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1b2b4a] text-white dark:bg-blue-600">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  {company?.name || "Queen St Hospitality"}
                </span>
                <span className="text-xs font-bold text-[#1b2b4a] dark:text-slate-200 truncate max-w-[130px] sm:max-w-[180px]">
                  {activeVenue?.name || "Queen St Slice Co."}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform dark:text-slate-500 ml-1" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-[#0f172a] z-50">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Company Locations
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate">
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
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 text-blue-900 font-semibold dark:bg-blue-950/60 dark:text-blue-200"
                            : isAssigned
                            ? "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                            : "opacity-40 cursor-not-allowed text-slate-400"
                        }`}
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="truncate">{rest.name}</span>
                          {rest.address && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              {rest.address}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {isOwner && (
                  <div className="border-t border-slate-100 p-1 dark:border-slate-800">
                    <Link
                      href="/team"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>Manage Team & Locations</span>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Light / Dark Mode Toggle */}
          <ThemeToggle />

          {userEmail ? (
            <button
              onClick={handleSignOut}
              title={`Sign Out (${userEmail})`}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/login"
              title="Sign In"
              className="flex items-center gap-1.5 rounded-lg bg-[#1b2b4a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors shadow-2xs"
            >
              <User className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

