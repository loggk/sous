"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { AlertCircle, CheckCircle2 } from "lucide-react";

type AuthMode = "signin" | "accept_invite" | "create_company";

const MODES: { key: AuthMode; tab: string; heading: string; blurb: string; cta: string }[] = [
  {
    key: "signin",
    tab: "Sign in",
    heading: "Welcome back",
    blurb: "Pick up where your last delivery left off.",
    cta: "Sign in",
  },
  {
    key: "accept_invite",
    tab: "Join a team",
    heading: "Join your team",
    blurb:
      "Use the email your company invited, and pick a password. You'll land straight on your venues.",
    cta: "Join and set password",
  },
  {
    key: "create_company",
    tab: "New company",
    heading: "Set up your company",
    blurb: "Your first location decides which kitchens you benchmark against.",
    cta: "Create company",
  },
];

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

  const current = MODES.find((m) => m.key === mode)!;

  function switchMode(next: AuthMode) {
    setMode(next);
    setErrorMsg(null);
    setSuccessMsg(null);
  }

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
          throw new Error("Your company needs a name.");
        }
        if (!locationName.trim()) {
          throw new Error("Give your first location a name.");
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
          setSuccessMsg("Check your inbox to confirm your email, then you're in.");
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
      setErrorMsg(err.message || "That didn't work. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-stretch overflow-hidden rounded border border-rule">
      {/* The pitch, in the logo's navy */}
      <div className="flex min-w-0 flex-[1_1_380px] flex-col justify-between gap-12 bg-ink px-10 py-12 text-on-ink">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[30px] font-extrabold leading-none tracking-tight">
            SOUS
          </span>
          <span className="font-display text-[10px] font-semibold uppercase leading-none tracking-[0.38em] text-ramp-5">
            Collective
          </span>
        </div>

        <div>
          <p className="display-sm max-w-md text-[30px] leading-snug text-on-ink">
            Broadline suppliers know what every kitchen in your neighbourhood pays. Now you do too.
          </p>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ramp-5">
            Upload your delivery invoices. Sous normalises every pack size, watches for prices
            creeping above your own baseline, and shows you the local median for the same ingredient
            pooled from independent operators and never attributed to anyone by name.
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-9 gap-y-4 border-t border-ramp-5/30 pt-5">
          <div>
            <dt className="num font-display text-[22px] font-bold text-on-ink">6+</dt>
            <dd className="mt-0.5 text-xs text-ramp-5">kitchens before a benchmark shows</dd>
          </div>
          <div>
            <dt className="num font-display text-[22px] font-bold text-on-ink">35%</dt>
            <dd className="mt-0.5 text-xs text-ramp-5">cap on any one kitchen&rsquo;s share</dd>
          </div>
          <div>
            <dt className="font-display text-[22px] font-bold text-on-ink">Never</dt>
            <dd className="mt-0.5 text-xs text-ramp-5">a named restaurant&rsquo;s price</dd>
          </div>
        </dl>
      </div>

      {/* The form */}
      <div className="flex min-w-0 flex-[999_1_440px] items-center justify-center bg-paper-raised px-8 py-12">
        <div className="w-full max-w-[420px]">
          <h1 className="display-xl text-[34px]">{current.heading}</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{current.blurb}</p>

          <div className="mt-6 flex gap-6 border-b border-rule">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => switchMode(m.key)}
                aria-current={mode === m.key ? "page" : undefined}
                className={`min-h-11 cursor-pointer border-b-2 pb-3 font-display text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  mode === m.key
                    ? "border-ink font-bold text-ink"
                    : "border-transparent font-semibold text-ink-muted hover:text-ink"
                }`}
              >
                {m.tab}
              </button>
            ))}
          </div>

          {!isConfigured && (
            <div className="mt-5 flex items-start gap-3 rounded bg-over-wash px-4 py-3.5 text-xs leading-relaxed text-over-ink">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Supabase keys are missing. Add{" "}
                <code className="rounded-sm bg-paper px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="rounded-sm bg-paper px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
                <code className="rounded-sm bg-paper px-1">web/.env.local</code>.
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="mt-5 flex items-start gap-3 rounded bg-over-wash px-4 py-3.5 text-[13px] text-over-ink">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mt-5 flex items-start gap-3 rounded bg-under-wash px-4 py-3.5 text-[13px] text-under-ink">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="mt-6 flex flex-col gap-5">
            {mode === "create_company" && (
              <>
                <div>
                  <label htmlFor="company" className="label-caps block pb-2">
                    Company name
                  </label>
                  <input
                    id="company"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Queen St Hospitality Group"
                    className="field"
                  />
                </div>

                <div>
                  <label htmlFor="location" className="label-caps block pb-2">
                    First location
                  </label>
                  <input
                    id="location"
                    type="text"
                    required
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Queen St Slice Co."
                    className="field"
                  />
                </div>

                <div>
                  <label htmlFor="address" className="label-caps block pb-2">
                    Street address
                  </label>
                  <input
                    id="address"
                    type="text"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    placeholder="123 Queen St W, Toronto, ON"
                    className="field"
                  />
                  <p className="mt-2 text-xs text-ink-muted">
                    Optional, but it is what decides which kitchens you benchmark against.
                  </p>
                </div>
              </>
            )}

            <div>
              <label htmlFor="email" className="label-caps block pb-2">
                {mode === "accept_invite" ? "The email you were invited on" : "Email"}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chef@slicepizzeria.ca"
                className="field"
              />
            </div>

            <div>
              <label htmlFor="password" className="label-caps block pb-2">
                {mode === "signin" ? "Password" : "Choose a password"}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="field"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="pill-primary mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "One moment…" : current.cta}
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-2.5 border-t border-rule pt-5">
            {mode === "signin" ? (
              <>
                <p className="text-[13.5px] text-ink-soft">
                  Invited by a restaurant?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("accept_invite")}
                    className="cursor-pointer font-semibold text-accent hover:underline"
                  >
                    Join their team &rarr;
                  </button>
                </p>
                <p className="text-[13.5px] text-ink-soft">
                  Owner or GM starting fresh?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("create_company")}
                    className="cursor-pointer font-semibold text-accent hover:underline"
                  >
                    Register a company &rarr;
                  </button>
                </p>
              </>
            ) : (
              <p className="text-[13.5px] text-ink-soft">
                Already set up?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="cursor-pointer font-semibold text-accent hover:underline"
                >
                  Sign in instead &rarr;
                </button>
              </p>
            )}
          </div>

          <p className="mt-7 text-xs leading-relaxed text-ink-muted">
            Your invoices stay yours. Only anonymised, aggregated unit prices ever reach the
            benchmark pool.
          </p>
        </div>
      </div>
    </div>
  );
}
