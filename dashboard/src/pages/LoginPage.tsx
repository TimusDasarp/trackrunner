import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, getToken, setSession } from "../lib/auth";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("dispatcher@demo.local");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) nav("/dashboard", { replace: true });
  }, [nav]);

  if (getToken()) return <Navigate to="/dashboard" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: any }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(res.token, res.user);
      nav("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.message ?? "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-panel rounded-2xl p-8 shadow-2xl border border-slate-800"
      >
        <h1 className="text-2xl font-semibold mb-1">TrackRunner</h1>
        <p className="text-slate-400 text-sm mb-6">Dispatcher sign-in</p>

        <label className="block text-sm text-slate-300 mb-1">Email</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-accent"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-sm text-slate-300 mb-1">Password</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-accent"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        <button
          disabled={busy}
          className="w-full py-2 rounded-lg bg-accent text-ink font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-xs text-slate-500 mt-4">
          Demo: <code>dispatcher@demo.local</code> / <code>demo1234</code>
        </p>
      </form>
    </div>
  );
}
