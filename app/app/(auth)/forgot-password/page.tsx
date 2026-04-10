"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always show success — don't leak whether the email exists
    } finally {
      setSubmitted(true);
      setIsLoading(false);
    }
  };

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

        <Card variant="glass" padding="lg">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-text-primary">Check your email</h2>
              <p className="text-sm text-text-secondary">
                If an account with that email exists, we&apos;ve sent a password reset link.
                The link expires in 1 hour.
              </p>
              <Link href="/app/login" className="text-emerald-400 hover:text-emerald-300 text-sm font-medium inline-block mt-2">
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold font-display text-text-primary">Forgot password?</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />

                <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                  Send Reset Link
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/app/login" className="text-sm text-text-muted hover:text-text-secondary transition-colors">
                  Back to login
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
