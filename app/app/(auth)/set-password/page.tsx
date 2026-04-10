"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!token) {
    return (
      <Card variant="glass" padding="lg">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm">Invalid or missing token.</p>
          <Link href="/app/login" className="text-emerald-400 hover:text-emerald-300 text-sm font-medium">
            Go to login
          </Link>
        </div>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to set password");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card variant="glass" padding="lg">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Password set successfully</h2>
          <p className="text-sm text-text-secondary">You can now sign in with your new password.</p>
          <Button onClick={() => router.push("/app/login")} className="w-full">
            Go to Login
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" padding="lg">
      <div className="mb-6">
        <h2 className="text-xl font-semibold font-display text-text-primary">Set your password</h2>
        <p className="text-sm text-text-secondary mt-1">Choose a password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <Input
          label="New Password"
          type="password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
          Set Password
        </Button>
      </form>
    </Card>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)" }}
      />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="font-display font-extrabold text-3xl text-white">
              green<span className="text-emerald-500">light</span>
            </h1>
            <p className="text-xs text-text-muted mt-1 tracking-wide">by Medivis</p>
          </Link>
        </div>
        <Suspense fallback={<Card variant="glass" padding="lg"><p className="text-center text-text-muted text-sm">Loading...</p></Card>}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
