"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Scale, Receipt, Sparkles, TrendingUp, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { ThemeToggle } from "@/components/ThemeToggle";

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
    { name: "Insights", href: "/", icon: TrendingUp },
    { name: "Benchmarks", href: "/benchmarks", icon: Scale },
    { name: "Invoices", href: "/invoices", icon: Receipt },
    { name: "Item Mapping", href: "/review", icon: Sparkles },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-[#0b1324]/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          {/* Logo only - rendered in its natural proportions without circle cropping */}
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
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
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
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-[#1b2b4a] dark:text-slate-200">
              {userEmail ? userEmail.split("@")[0] : "Queen St Slice Co."}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {userEmail ? userEmail : "Independent Restaurant"}
            </span>
          </div>

          {/* Light / Dark Mode Toggle */}
          <ThemeToggle />

          {userEmail ? (
            <button
              onClick={handleSignOut}
              title="Sign Out"
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

