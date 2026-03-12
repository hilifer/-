"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIBanner } from "@/components/ai-banner";

interface HerbEntry {
  name: string;
  dosage: number;
  unit: string;
}

interface SafetyWarningEntry {
  type: string;
  severity: string;
  message: string;
}

const IMAGE_TYPE_LABELS: Record<string, string> = {
  TONGUE: "舌诊",
  FACE: "面诊",
  FINGER: "指纹",
};

export default function PatientPrescriptionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { data: session, status } = useSession();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [consultation, setConsultation] = useState<any>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session && session.user.role !== "PATIENT") router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (!id || !session) return;
    fetch(`/api/consultation/${id}/message`)
      .then((r) => r.json())
      .then(setConsultation);
  }, [id, session]);

  if (!session || !consultation) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  const diagnosis = consultation.diagnosis;
  const prescription = consultation.prescription;
  const herbs: HerbEntry[] = prescription
    ? JSON.parse(prescription.herbs)
    : [];
  const warnings: SafetyWarningEntry[] = prescription?.safetyWarnings
    ? JSON.parse(prescription.safetyWarnings)
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AIBanner />

      <div className="my-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">处方详情</h1>
        <button
          onClick={() => router.push("/patient/prescriptions")}
          className="text-sm text-gray-400 hover:text-emerald-400"
        >
          ← 返回列表
        </button>
      </div>

      {/* Patient info */}
      {(consultation.patientName || consultation.patientGender || consultation.patientAge || consultation.patientWeight) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>患者信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 text-gray-300">
              {consultation.patientName && <span>姓名：{consultation.patientName}</span>}
              {consultation.patientGender && (
                <span>性别：{consultation.patientGender === "MALE" ? "男" : "女"}</span>
              )}
              {consultation.patientAge && <span>年龄：{consultation.patientAge}岁</span>}
              {consultation.patientWeight && <span>体重：{consultation.patientWeight}kg</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnosis summary */}
      {diagnosis && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>AI辨证：{diagnosis.syndromeType}</span>
              <Badge
                variant={
                  diagnosis.confidence >= 0.8
                    ? "default"
                    : diagnosis.confidence >= 0.6
                      ? "warning"
                      : "error"
                }
              >
                置信度 {Math.round(diagnosis.confidence * 100)}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm mb-2">
              推荐方剂：
              <span className="text-emerald-300">{diagnosis.recommendedFormula}</span>
            </p>
            {diagnosis.reasoning && (
              <p className="text-gray-400 text-sm">{diagnosis.reasoning}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Uploaded images */}
      {consultation.images && consultation.images.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>望诊照片</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {consultation.images.map(
                (img: { id: string; type: string; data: string; mimeType: string }) => {
                  const src = `data:${img.mimeType};base64,${img.data}`;
                  return (
                    <div key={img.id} className="text-center">
                      <img
                        src={src}
                        alt={IMAGE_TYPE_LABELS[img.type] || img.type}
                        className="w-full h-28 object-cover rounded-lg border border-gray-700 cursor-pointer hover:border-emerald-500 transition-colors"
                        onClick={() => setLightboxSrc(src)}
                      />
                      <span className="text-xs text-gray-400 mt-1 block">
                        {IMAGE_TYPE_LABELS[img.type] || img.type}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversation history */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>问诊记录</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {consultation.messages?.map(
              (msg: { id: string; role: string; content: string }) => (
                <div
                  key={msg.id}
                  className={`text-sm ${
                    msg.role === "USER" ? "text-emerald-300" : "text-gray-400"
                  }`}
                >
                  <span className="font-medium">
                    {msg.role === "USER" ? "患者：" : "AI："}
                  </span>
                  {msg.content}
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Prescription herbs (read-only) */}
      {herbs.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>处方药材</span>
              {prescription?.status === "SIGNED" && <Badge>已签发</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {herbs.map((h, i) => (
                <span
                  key={i}
                  className="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                >
                  {h.name} {h.dosage}{h.unit}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Safety warnings */}
      {warnings.length > 0 && (
        <Card className="mb-6 border-red-800">
          <CardHeader>
            <CardTitle className="text-red-400">安全检查结果</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    w.severity === "ERROR"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {w.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Doctor notes */}
      {prescription?.doctorNotes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>医嘱备注</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300">{prescription.doctorNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Sign time */}
      {prescription?.signedAt && (
        <p className="text-xs text-gray-600">
          签发时间：{new Date(prescription.signedAt).toLocaleString("zh-CN")}
        </p>
      )}

      {/* Image lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
            onClick={() => setLightboxSrc(null)}
          >
            ×
          </button>
          <img
            src={lightboxSrc}
            alt="放大查看"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
