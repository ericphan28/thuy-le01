"use client"

import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/client";
import { LogoutButton } from "./logout-button";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";

export function ClientAuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  if (loading) {
    return <div className="w-20 h-8 bg-gray-200 animate-pulse rounded" />;
  }

  return user ? (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {user.email}
      </span>
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/auth/login">Sign in</Link>
      </Button>
    </div>
  );
}
