"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import {
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Building2,
  MapPin,
  Users,
} from "lucide-react";

type AuthMode = "signin" | "accept_invite" | "create_company";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "accept_invite") {
        // 1. Accept Invitation & activate user in company
        const res = await api.acceptInvite(email.trim(), password);
        setSuccessMsg(res.message);

        // 2. Automatically log them in with their newly set password
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;

        router.push("/");
        router.refresh();
      } else if (mode === "create_company") {
        // Register new company & location
        if (!companyName.trim()) {
          throw new Error("Company or hospitality group name is required");
        }
        if (!locationName.trim()) {
          throw new Error("Initial restaurant location name is required");
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        try {
          const registered = await api.registerCompany({
            company_name: companyName.trim(),
            restaurant_name: locationName.trim(),
            address: locationAddress.trim() || undefined,
            admin_email: email.trim(),
          });
          if (registered.restaurants.length > 0) {
            localStorage.setItem("sous_active_restaurant_id", registered.restaurants[0].id);
          }
        } catch (compErr: any) {
          console.warn("Backend company registration deferred:", compErr);
        }

        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          setSuccessMsg("Check your inbox to confirm your email and complete account setup!");
        }
      } else {
        // Standard Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-100/60 dark:border-slate-800 dark:bg-[#131f37] dark:shadow-none">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex justify-center">
            <Image
              src="/logo.png"
              width={71}
              height={64}
              alt="Sous Logo"
              className="h-14 w-auto object-contain"
              priority
            />
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100">
            {mode === "signin" && "Sign in to Sous"}
            {mode === "accept_invite" && "Join your Restaurant Team"}
            {mode === "create_company" && "Register Restaurant Group"}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {mode === "signin" && "Access your restaurant spend audit and local price benchmarks"}
            {mode === "accept_invite" && "Accept your team invitation and set your operator password"}
            {mode === "create_company" && "Create a new organization and your initial restaurant location"}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 rounded-lg py-2 transition-all cursor-pointer ${
              mode === "signin"
                ? "bg-white text-slate-900 shadow-2xs dark:bg-[#1b2b4a] dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("accept_invite");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 rounded-lg py-2 transition-all cursor-pointer ${
              mode === "accept_invite"
                ? "bg-white text-slate-900 shadow-2xs dark:bg-[#1b2b4a] dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            Join Team
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("create_company");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 rounded-lg py-2 transition-all cursor-pointer ${
              mode === "create_company"
                ? "bg-white text-slate-900 shadow-2xs dark:bg-[#1b2b4a] dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            New Company
          </button>
        </div>

        {/* Configuration Warning Banner (if env vars missing) */}
        {!isConfigured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold">Supabase Keys Required:</span>
              <p className="mt-0.5">
                Add <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{" "}
                <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1">web/.env.local</code> file.
              </p>
            </div>
          </div>
        )}

        {/* Context info for Accept Invite mode */}
        {mode === "accept_invite" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 flex items-start gap-2.5">
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Invited by your company?</span>
              <p className="mt-0.5">
                Enter your invited email address and create your password to immediately link your account to your assigned venues.
              </p>
            </div>
          </div>
        )}

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {mode === "create_company" && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Company / Organization Name
                </label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Queen St Hospitality Group"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white focus:ring-2 focus:ring-[#2f4a7d]/20 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 dark:placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  First Restaurant / Location Name
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Queen St Slice Co. (Downtown)"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white focus:ring-2 focus:ring-[#2f4a7d]/20 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 dark:placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Street Address (Optional)
                </label>
                <input
                  type="text"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  placeholder="123 Queen St W, Toronto, ON"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white focus:ring-2 focus:ring-[#2f4a7d]/20 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 dark:placeholder-slate-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              {mode === "accept_invite" ? "Invited Email Address" : "Email Address"}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chef@slicepizzeria.ca"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white focus:ring-2 focus:ring-[#2f4a7d]/20 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 dark:placeholder-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              {mode === "accept_invite" ? "Create Password" : "Password"}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white focus:ring-2 focus:ring-[#2f4a7d]/20 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 dark:placeholder-slate-500"
              />
            </div>
            {mode === "accept_invite" && (
              <p className="mt-1 text-[11px] text-slate-400">Choose a password with at least 6 characters.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b2b4a] py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>
                  {mode === "signin" && "Sign In"}
                  {mode === "accept_invite" && "Join Team & Set Password"}
                  {mode === "create_company" && "Create Restaurant Group"}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Helper Toggle Links */}
        <div className="text-center pt-1 space-y-1">
          {mode === "signin" ? (
            <div className="flex flex-col gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode("accept_invite");
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="font-medium text-[#2f4a7d] hover:underline dark:text-blue-400 cursor-pointer"
              >
                Invited by a restaurant? <span className="font-bold">Join Existing Team →</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("create_company");
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Owner or GM starting fresh? <span className="font-semibold underline">Register a New Company</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-xs font-semibold text-[#2f4a7d] hover:text-[#1b2b4a] dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
            >
              Already set up? Sign in instead
            </button>
          )}
        </div>

        {/* Trust Posture Badge */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-[#2f4a7d] dark:text-blue-400 shrink-0" />
          <span>Anonymous, privacy-protected price intelligence for independent operators</span>
        </div>
      </div>
    </div>
  );
}
