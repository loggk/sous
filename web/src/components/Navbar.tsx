"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Scale, Receipt, Sparkles, TrendingUp, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

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
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    } catch {
      // Supabase credentials not set yet
    }
  }, []);

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUserEmail(null);
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  }

  const navItems = [
    { name: "Local Benchmarks", href: "/benchmarks", icon: Scale },
    { name: "Audit & Spend", href: "/", icon: TrendingUp },
    { name: "Invoices & Upload", href: "/invoices", icon: Receipt },
    { name: "Review Queue", href: "/review", icon: Sparkles },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white font-bold shadow-md shadow-orange-500/20">
              S
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Sous
              </span>
              <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-orange-800 dark:bg-orange-950/60 dark:text-orange-400">
                GTA PILOT
              </span>
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
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-orange-600" : "text-zinc-400"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {userEmail ? userEmail.split("@")[0] : "Queen St Slice Co."}
            </span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {userEmail ? userEmail : "Toronto, ON (Downtown West)"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Network
          </div>

          {userEmail ? (
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/login"
              title="Sign In"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
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

