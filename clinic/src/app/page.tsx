"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      if (session.user.role === "DOCTOR") {
        router.push("/doctor/patients");
      } else {
        router.push("/patient/consultation");
      }
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  if (session) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="mb-2 text-5xl font-bold text-emerald-400">杏林智诊</h1>
        <p className="mb-8 text-xl text-gray-400">中西医结合智慧诊疗平台</p>
        <p className="mb-12 max-w-md text-gray-500">
          融合传统中医智慧与现代AI技术，为您提供专业的辨证施治服务
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <Button size="lg">登录</Button>
          </Link>
          <Link href="/register">
            <Button variant="outline" size="lg">
              注册
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
