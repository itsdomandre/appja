"use client";

/**
 * Shared backoffice navigation shell (spec.md §8 AC32 — sub-task 7). A
 * native `<header>` (renders with the "banner" ARIA landmark role)
 * containing the app name -- matching `app/layout.tsx`'s `metadata.title`
 * ("Raio") -- present with the same computed `background-color` on
 * `/backoffice/login`, `/backoffice`, and `/backoffice/[id]`. Decision from
 * specs/registration-backoffice/decisions.md: no sidebar, just this topbar.
 *
 * `showLogout` renders a logout affordance wired to the existing
 * `POST /api/admin/logout` (app/api/admin/logout/route.ts) -- passed `true`
 * on /backoffice and /backoffice/[id] (where an admin session exists) and
 * omitted on /backoffice/login.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface TopbarProps {
  showLogout?: boolean;
}

export default function Topbar({ showLogout = false }: TopbarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  function onLogoutClick() {
    handleLogout().catch((err) => {
      console.error("Unexpected error while logging out:", err);
    });
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/backoffice/login");
    }
  }

  return (
    <header className="bg-gray-900 text-white">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
        <span className="text-base font-semibold tracking-tight">AppJA - IASD AMADORA</span>

        {showLogout && (
          <button
            type="button"
            onClick={onLogoutClick}
            disabled={loggingOut}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors
              hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sair
          </button>
        )}
      </div>
    </header>
  );
}
