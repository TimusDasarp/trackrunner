import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, getToken, setSession } from "../lib/auth";
import { Button, Card, Input } from "@material-tailwind/react";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_#e8f0f6,_#faf5f1_48%,_#f3f0ed)] p-5">
      <Card className="w-full max-w-sm rounded-[24px] border border-[#e5e1dc] bg-white/95 p-8 shadow-[0_20px_60px_rgba(16,32,56,.14)]" color="default">
      <form onSubmit={submit}>
        <div className="mb-7 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#003766] text-xl text-white">↗</div><div><h1 className="text-2xl font-semibold text-[#102038]">TrackRunner</h1><p className="text-[#5e6a69] text-sm">Dispatcher workspace</p></div></div>

        <label className="block text-sm font-medium text-[#102038] mb-1">Email</label>
        <Input
          className="w-full mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          required
        />

        <label className="block text-sm font-medium text-[#102038] mb-1">Password</label>
        <Input
          className="w-full mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        <Button
          disabled={busy}
          className="mt-2 w-full rounded-xl bg-[#003766] text-white disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </Button>
      </form></Card>
    </div>
  );
}
