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
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
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

      if (isSignUp) {
        if (!companyName.trim()) {
          throw new Error("Company or hospitality group name is required");
        }
        if (!locationName.trim()) {
          throw new Error("Initial restaurant location name is required");
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        // Register company & initial restaurant location in backend
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
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-100/60 dark:border-slate-800 dark:bg-[#131f37] dark:shadow-none">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex justify-center">
            <Image
              src="/logo.png"
              width={71}
              height={64}
              alt="Sous Logo"
              className="h-16 w-auto object-contain"
              priority
            />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100">
            {isSignUp ? "Create your Sous Account" : "Sign in to Sous"}
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {isSignUp
              ? "Join the independent restaurant cost-intelligence network"
              : "Access your restaurant spend audit and local price benchmarks"}
          </p>
        </div>

        {/* Configuration Warning Banner (if env vars missing) */}
        {!isConfigured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold">Supabase Keys Required:</span>
              <p className="mt-0.5">
                Add <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{" "}
                <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1">web/.env.local</code> file to enable live sign in.
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
          {isSignUp && (
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
              Email Address
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
              Password
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
                <span>{isSignUp ? "Create Restaurant Account" : "Sign In"}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Toggle between Sign In / Sign Up */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className="text-xs font-semibold text-[#2f4a7d] hover:text-[#1b2b4a] dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            {isSignUp
              ? "Already have an account? Sign in instead"
              : "Don't have an account yet? Create one"}
          </button>
        </div>

        {/* Trust Posture Badge */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-[#2f4a7d] dark:text-blue-400 shrink-0" />
          <span>Anonymous, privacy-protected price intelligence for independent operators</span>
        </div>
      </div>
    </div>
  );
}
