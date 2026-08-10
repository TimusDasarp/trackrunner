import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, getToken, setSession } from "../lib/auth";
import { Button, Card, Input } from "@material-tailwind/react";

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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_#dce6ff,_#f8f7ff_45%,_#eef3ff)] p-5">
      <Card className="w-full max-w-sm rounded-[28px] bg-white/90 p-8 shadow-[0_20px_60px_rgba(40,55,82,.18)]" color="default">
      <form onSubmit={submit}>
        <div className="mb-7 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-xl text-white">↗</div><div><h1 className="text-2xl font-semibold text-ink">TrackRunner</h1><p className="text-on-surface-variant text-sm">Dispatcher workspace</p></div></div>

        <label className="block text-sm text-slate-300 mb-1">Email</label>
        <Input
          className="w-full mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-sm text-slate-300 mb-1">Password</label>
        <Input
          className="w-full mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        <Button
          disabled={busy}
          className="mt-2 w-full rounded-full bg-accent text-white disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-xs text-slate-500 mt-4">
          Demo: <code>dispatcher@demo.local</code> / <code>demo1234</code>
        </p>
      </form></Card>
    </div>
  );
}
