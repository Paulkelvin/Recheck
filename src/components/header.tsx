"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button, LinkButton } from "@/components/ui/button";

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-foreground sm:gap-2 sm:text-lg"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-brand-foreground sm:h-8 sm:w-8 sm:text-sm">
            LS
          </span>
          <span>Land Scam Check</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted sm:flex">
          <Link href="/check" className="hover:text-foreground">
            Check my land
          </Link>
          <Link href="/directory" className="hover:text-foreground">
            Directory
          </Link>
          <Link href="/for-surveyors" className="hover:text-foreground">
            For surveyors
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {status === "loading" ? null : session?.user ? (
            <>
              {session.user.role === "admin" && (
                <LinkButton href="/admin/reports" variant="secondary" size="sm">
                  Admin
                </LinkButton>
              )}
              {session.user.role === "surveyor" && (
                <LinkButton href="/dashboard" variant="secondary" size="sm">
                  My assignments
                </LinkButton>
              )}
              <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton href="/signup" variant="primary" size="sm">
                Sign up
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
