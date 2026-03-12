"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIBanner } from "@/components/ai-banner";

interface DiagnosisData {
  syndromeType: string;
  confidence: number;
  reasoning: string;
  recommendedFormula: string;
  formulaHerbs: string;
}

interface PrescriptionData {
  id: string;
  status: string;
  herbs: string;
  safetyWarnings: string;
}

interface ImageData {
  id: string;
  type: string;
  data: string;
  mimeType: string;
}

interface ConsultationData {
  id: string;
  status: string;
  patientName?: string;
  patientAge?: number | null;
  patientWeight?: number | null;
  diagnosis: DiagnosisData | null;
  prescription: PrescriptionData | null;
  images?: ImageData[];
}

const IMAGE_TYPE_LABELS: Record<string, string> = {
  TONGUE: "舌诊",
  FACE: "面诊",
  FINGER: "指纹",
};

export default function DiagnosisPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/consultation/${id}/message`)
      .then((r) => r.json())
      .then((data) => {
        setConsultation(data);
        setLoading(false);
      });
  }, [id]);

  if (loading || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  if (!consultation?.diagnosis) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-gray-400">暂无辨证结果</p>
      </div>
    );
  }

  const { diagnosis, prescription } = consultation;
  const herbs = (() => {
    try {
      const parsed = JSON.parse(diagnosis.formulaHerbs);
      return Array.isArray(parsed) ? parsed as { name: string; dosage: number; unit: string }[] : [];
    } catch {
      return [];
    }
  })();
  const warnings = prescription
    ? (() => {
        try {
          const parsed = JSON.parse(prescription.safetyWarnings);
          return Array.isArray(parsed) ? parsed as { severity: string; message: string }[] : [];
        } catch {
          return [];
        }
      })()
    : [];

  const confidencePercent = Math.round(diagnosis.confidence * 100);
  const isInsufficient = diagnosis.confidence === 0 || herbs.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AIBanner />

      <h1 className="my-6 text-2xl font-bold text-emerald-400">AI辨证结果</h1>

      <div className="space-y-6">
        {/* Insufficient info warning */}
        {isInsufficient && (
          <Card className="border-yellow-600">
            <CardContent className="py-6 text-center">
              <p className="text-yellow-400 text-lg font-medium mb-2">
                问诊信息不足，无法生成可靠的辨证结果
              </p>
              <p className="text-gray-400 text-sm mb-4">
                请重新进行问诊，详细描述您的症状、不适部位、持续时间等信息
              </p>
              <button
                onClick={() => router.push("/patient/consultation")}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
              >
                重新问诊
              </button>
            </CardContent>
          </Card>
        )}

        {/* Patient info */}
        {consultation.patientName && (
          <Card>
            <CardHeader>
              <CardTitle>患者信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-gray-300">
                <span>姓名：{consultation.patientName}</span>
                {consultation.patientAge && <span>年龄：{consultation.patientAge}岁</span>}
                {consultation.patientWeight && <span>体重：{consultation.patientWeight}kg</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Syndrome type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>辨证分型</span>
              <Badge
                variant={
                  confidencePercent >= 80
                    ? "default"
                    : confidencePercent >= 60
                      ? "warning"
                      : confidencePercent > 0
                        ? "error"
                        : "error"
                }
              >
                {confidencePercent > 0 ? `置信度 ${confidencePercent}%` : "无法辨证"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${isInsufficient ? "text-yellow-400" : "text-emerald-300"}`}>
              {diagnosis.syndromeType}
            </p>
          </CardContent>
        </Card>

        {/* Uploaded images */}
        {consultation.images && consultation.images.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>望诊照片</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {consultation.images.map((img) => {
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
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reasoning */}
        <Card>
          <CardHeader>
            <CardTitle>辨证推理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 leading-relaxed">{diagnosis.reasoning}</p>
          </CardContent>
        </Card>

        {/* Recommended formula — only show when herbs exist */}
        {herbs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                推荐方剂：
                <span className="text-emerald-300">
                  {diagnosis.recommendedFormula}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="pb-2 text-gray-400">药材</th>
                      <th className="pb-2 text-gray-400">剂量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {herbs.map((herb, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-2 text-gray-200">{herb.name}</td>
                        <td className="py-2 text-gray-300">
                          {herb.dosage}
                          {herb.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Safety warnings */}
        {warnings.length > 0 && (
          <Card className="border-red-800">
            <CardHeader>
              <CardTitle className="text-red-400">安全检查警告</CardTitle>
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

        {/* Status notice */}
        <Card>
          <CardContent className="text-center py-4">
            {isInsufficient ? (
              <p className="text-yellow-400">
                问诊信息不足，未生成处方。请重新详细问诊后再获取诊断。
              </p>
            ) : prescription?.status === "SIGNED" ? (
              <p className="text-emerald-400">处方已由医生签发，请前往查看</p>
            ) : (
              <p className="text-yellow-400">
                等待医生审核中，医生将对AI建议进行专业评估后签发处方
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
