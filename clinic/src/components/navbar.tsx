"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "./ui/button";

export function Navbar() {
  const { data: session } = useSession();

  if (!session) return null;

  const isDoctor = session.user.role === "DOCTOR";
  const isAdmin = session.user.role === "ADMIN";

  return (
    <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-emerald-400">
          杏林智诊
        </Link>

        <div className="flex items-center gap-4">
          {!isDoctor && !isAdmin && (
            <>
              <Link
                href="/patient/consultation"
                className="text-gray-300 hover:text-emerald-400 transition-colors"
              >
                AI问诊
              </Link>
              <Link
                href="/patient/prescriptions"
                className="text-gray-300 hover:text-emerald-400 transition-colors"
              >
                我的处方
              </Link>
            </>
          )}

          {isDoctor && (
            <>
              <Link
                href="/doctor/patients"
                className="text-gray-300 hover:text-emerald-400 transition-colors"
              >
                待审患者
              </Link>
            </>
          )}

          <span className="text-sm text-gray-500">
            {session.user.name}
            <span className="ml-1 text-emerald-400/60">
              ({isDoctor ? "医生" : isAdmin ? "管理员" : "患者"})
            </span>
          </span>

          <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
            退出
          </Button>
        </div>
      </div>
    </nav>
  );
}
