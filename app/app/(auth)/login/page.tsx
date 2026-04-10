"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("SERVICE_UNAVAILABLE") || result.code === "SERVICE_UNAVAILABLE") {
          setError("Service temporarily unavailable. Please try again later.");
        } else {
          setError("Invalid email or password");
        }
      } else {
        router.push("/app/dashboard");
        router.refresh();
      }
    } catch {
      setError("Service temporarily unavailable. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      {/* Background glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="font-display font-extrabold text-3xl text-white">
              green<span className="text-emerald-500">light</span>
            </h1>
            <p className="text-xs text-text-muted mt-1 tracking-wide">
              by Medivis
            </p>
          </Link>
        </div>

        <Card variant="glass" padding="lg">
          <div className="mb-6">
            <h2 className="text-xl font-semibold font-display text-text-primary">
              Welcome back
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </form>

          <div className="mt-4 text-right">
            <Link
              href="/app/forgot-password"
              className="text-sm text-text-muted hover:text-emerald-400 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-text-muted">
              Don&apos;t have an account?{" "}
              <Link
                href="/app/register"
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Register
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
