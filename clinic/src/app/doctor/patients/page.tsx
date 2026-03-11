"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ConsultationItem {
  id: string;
  status: string;
  createdAt: string;
  patient: { name: string; phone: string };
  diagnosis: {
    syndromeType: string;
    confidence: number;
    recommendedFormula: string;
  } | null;
  prescription: {
    id: string;
    status: string;
    adoptionLevel: string;
  } | null;
}

export default function DoctorPatientsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session && session.user.role !== "DOCTOR") router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (session?.user.role === "DOCTOR") {
      fetch("/api/consultation")
        .then((r) => r.json())
        .then(setConsultations);
    }
  }, [session]);

  if (!session || session.user.role !== "DOCTOR") return null;

  const pending = consultations.filter(
    (c) => !c.prescription || c.prescription.status === "DRAFT"
  );
  const signed = consultations.filter(
    (c) => c.prescription?.status === "SIGNED"
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-emerald-400">患者列表</h1>

      {pending.length === 0 && signed.length === 0 && (
        <Card className="text-center py-8">
          <p className="text-gray-400">暂无待审核的患者</p>
        </Card>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-semibold text-yellow-400">
            待审核 ({pending.length})
          </h2>
          <div className="space-y-4 mb-8">
            {pending.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-lg text-gray-200">{c.patient.name}</p>
                    <p className="text-sm text-gray-500">
                      {c.diagnosis?.syndromeType || "未辨证"} ·{" "}
                      {c.diagnosis?.recommendedFormula || ""}
                    </p>
                    <p className="text-xs text-gray-600">
                      {new Date(c.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.diagnosis && (
                      <Badge variant="warning">
                        置信度 {Math.round(c.diagnosis.confidence * 100)}%
                      </Badge>
                    )}
                    <Link href={`/doctor/review/${c.id}`}>
                      <Button size="sm">审核</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {signed.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-semibold text-gray-400">
            已签发 ({signed.length})
          </h2>
          <div className="space-y-4">
            {signed.map((c) => (
              <Card key={c.id} className="opacity-60">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-gray-300">{c.patient.name}</p>
                    <p className="text-sm text-gray-500">
                      {c.diagnosis?.syndromeType} ·{" "}
                      {c.diagnosis?.recommendedFormula}
                    </p>
                  </div>
                  <Badge>已签发</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
