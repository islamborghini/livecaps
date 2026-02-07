"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContextProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0D] flex items-center justify-center px-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-white">
            LiveCaps
          </Link>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>

        {/* Form card */}
        <Card className="bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.08] rounded-2xl shadow-sm">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert className="bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-lg p-3">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <div>
                <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email
                </Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 h-auto rounded-lg border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-[#0D9488] focus:border-transparent transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password
                </Label>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 h-auto rounded-lg border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-[#0D9488] focus:border-transparent transition-colors"
                  placeholder="Enter your password"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                variant="gradient"
                className="w-full py-2.5 rounded-lg"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-[#0D9488] hover:text-[#0F766E] dark:text-[#5EEAD4] dark:hover:text-[#14B8A6] font-medium transition-colors"
              >
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
