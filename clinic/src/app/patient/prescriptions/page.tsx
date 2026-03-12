"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface PrescriptionItem {
  id: string;
  status: string;
  herbs: string;
  doctorNotes: string;
  signedAt: string | null;
  createdAt: string;
  consultation: {
    id: string;
    diagnosis: {
      syndromeType: string;
      recommendedFormula: string;
    } | null;
  };
}

export default function PrescriptionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [consultations, setConsultations] = useState<
    {
      id: string;
      status: string;
      createdAt: string;
      patientName?: string;
      patientGender?: string;
      patientAge?: number | null;
      patientWeight?: number | null;
      diagnosis: { syndromeType: string; recommendedFormula: string } | null;
      prescription: PrescriptionItem | null;
    }[]
  >([]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/consultation")
        .then((r) => r.json())
        .then(setConsultations);
    }
  }, [session]);

  if (!session) return null;

  const signedPrescriptions = consultations.filter(
    (c) => c.prescription?.status === "SIGNED"
  );
  const pendingConsultations = consultations.filter(
    (c) => !c.prescription || c.prescription.status !== "SIGNED"
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-emerald-400">我的处方</h1>

      {consultations.length === 0 && (
        <Card className="text-center py-8">
          <p className="text-gray-400">暂无问诊记录</p>
          <Link
            href="/patient/consultation"
            className="mt-2 inline-block text-emerald-400 hover:underline"
          >
            去问诊
          </Link>
        </Card>
      )}

      {signedPrescriptions.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-semibold text-gray-300">
            已签发处方
          </h2>
          <div className="space-y-4 mb-8">
            {signedPrescriptions.map((c) => {
              const herbs = c.prescription
                ? (JSON.parse(c.prescription.herbs) as {
                    name: string;
                    dosage: number;
                    unit: string;
                  }[])
                : [];
              return (
                <Card key={c.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>
                        {c.diagnosis?.recommendedFormula || "处方"}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          {c.diagnosis?.syndromeType}
                        </span>
                      </span>
                      <Badge>已签发</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Patient info */}
                    {(c.patientName || c.patientGender || c.patientAge || c.patientWeight) && (
                      <div className="mb-3 flex gap-4 text-sm text-gray-400">
                        {c.patientName && <span>姓名：{c.patientName}</span>}
                        {c.patientGender && (
                          <span>性别：{c.patientGender === "MALE" ? "男" : "女"}</span>
                        )}
                        {c.patientAge && <span>年龄：{c.patientAge}岁</span>}
                        {c.patientWeight && <span>体重：{c.patientWeight}kg</span>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {herbs.map((h, i) => (
                        <span
                          key={i}
                          className="rounded bg-gray-800 px-2 py-1 text-sm text-gray-300"
                        >
                          {h.name} {h.dosage}
                          {h.unit}
                        </span>
                      ))}
                    </div>
                    {c.prescription?.doctorNotes && (
                      <p className="mt-3 text-sm text-gray-400">
                        医嘱：{c.prescription.doctorNotes}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-gray-600">
                        签发时间：
                        {c.prescription?.signedAt
                          ? new Date(c.prescription.signedAt).toLocaleString(
                              "zh-CN"
                            )
                          : "-"}
                      </p>
                      <Link
                        href={`/patient/prescriptions/${c.id}`}
                        className="text-sm text-emerald-400 hover:underline"
                      >
                        查看详情 →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {pendingConsultations.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-semibold text-gray-300">
            进行中的问诊
          </h2>
          <div className="space-y-4">
            {pendingConsultations.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-gray-300">
                      {c.diagnosis?.syndromeType || "问诊进行中"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(c.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <Badge
                    variant={
                      c.status === "IN_PROGRESS"
                        ? "info"
                        : c.status === "DIAGNOSED"
                          ? "warning"
                          : "default"
                    }
                  >
                    {c.status === "IN_PROGRESS"
                      ? "问诊中"
                      : c.status === "COMPLETED"
                        ? "待辨证"
                        : c.status === "DIAGNOSED"
                          ? "待审核"
                          : c.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
