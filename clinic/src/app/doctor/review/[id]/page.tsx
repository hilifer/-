"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AIBanner } from "@/components/ai-banner";

interface HerbEntry {
  name: string;
  dosage: number;
  unit: string;
}

interface SafetyWarningEntry {
  type: string;
  severity: string;
  herbA: string;
  herbB?: string;
  message: string;
}

export default function ReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { data: session, status } = useSession();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [consultation, setConsultation] = useState<any>(null);
  const [herbs, setHerbs] = useState<HerbEntry[]>([]);
  const [originalHerbs, setOriginalHerbs] = useState<HerbEntry[]>([]);
  const [warnings, setWarnings] = useState<SafetyWarningEntry[]>([]);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [adoptionLevel, setAdoptionLevel] = useState("ADOPT_ALL");
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session && session.user.role !== "DOCTOR") router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/consultation/${id}/message`)
      .then((r) => r.json())
      .then((data) => {
        setConsultation(data);
        if (data.prescription) {
          const parsedHerbs = JSON.parse(data.prescription.herbs);
          setHerbs(parsedHerbs);
          setWarnings(JSON.parse(data.prescription.safetyWarnings));
          setDoctorNotes(data.prescription.doctorNotes || "");
          if (data.prescription.adoptionLevel !== "PENDING") {
            setAdoptionLevel(data.prescription.adoptionLevel);
          }
        }
        // Store original AI herbs from diagnosis for reset
        if (data.diagnosis?.formulaHerbs) {
          setOriginalHerbs(JSON.parse(data.diagnosis.formulaHerbs));
        }
      });
  }, [id]);

  const updateHerb = (index: number, field: keyof HerbEntry, value: string | number) => {
    setHerbs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeHerb = (index: number) => {
    setHerbs((prev) => prev.filter((_, i) => i !== index));
  };

  const addHerb = () => {
    setHerbs((prev) => [...prev, { name: "", dosage: 9, unit: "g" }]);
  };

  const saveReview = async () => {
    if (!consultation?.prescription) return;
    setSaving(true);

    const res = await fetch(
      `/api/prescription/${consultation.prescription.id}/review`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          herbs,
          adoptionLevel,
          doctorNotes,
        }),
      }
    );

    const data = await res.json();
    if (res.ok) {
      setWarnings(data.safetyWarnings);
    }
    setSaving(false);
  };

  const signPrescription = async () => {
    if (!consultation?.prescription) return;
    setSigning(true);

    // Save first
    await saveReview();

    const res = await fetch(
      `/api/prescription/${consultation.prescription.id}/sign`,
      { method: "POST" }
    );

    if (res.ok) {
      router.push("/doctor/patients");
    } else {
      const data = await res.json();
      alert(data.error || "签发失败");
    }
    setSigning(false);
  };

  if (!session || !consultation) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  const diagnosis = consultation.diagnosis;
  const hasErrors = warnings.some((w) => w.severity === "ERROR");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AIBanner />

      <h1 className="my-6 text-2xl font-bold text-emerald-400">处方审核</h1>

      {/* Diagnosis summary */}
      {diagnosis && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                AI辨证：{diagnosis.syndromeType}
              </span>
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
            <p className="text-gray-400 text-sm">{diagnosis.reasoning}</p>
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

      {/* Adoption level */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>采纳AI建议</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant={adoptionLevel === "ADOPT_ALL" ? "default" : "outline"}
              onClick={() => {
                setAdoptionLevel("ADOPT_ALL");
                setHerbs(originalHerbs.map((h) => ({ ...h })));
              }}
            >
              采纳全部
            </Button>
            <Button
              variant={adoptionLevel === "PARTIAL_MODIFY" ? "warning" : "outline"}
              onClick={() => {
                setAdoptionLevel("PARTIAL_MODIFY");
              }}
              className={
                adoptionLevel === "PARTIAL_MODIFY"
                  ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                  : ""
              }
            >
              部分修改
            </Button>
            <Button
              variant={adoptionLevel === "FULL_REWRITE" ? "destructive" : "outline"}
              onClick={() => {
                setAdoptionLevel("FULL_REWRITE");
                setHerbs([{ name: "", dosage: 9, unit: "g" }]);
              }}
            >
              完全重写
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {adoptionLevel === "ADOPT_ALL" && "已恢复AI推荐的原始药材"}
            {adoptionLevel === "PARTIAL_MODIFY" && "可在下方直接编辑药材"}
            {adoptionLevel === "FULL_REWRITE" && "已清空药材，请重新添加"}
          </p>
        </CardContent>
      </Card>

      {/* Herbs editor */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>处方药材</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {herbs.map((herb, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1 min-w-0"
                  value={herb.name}
                  onChange={(e) => updateHerb(i, "name", e.target.value)}
                  placeholder="药材名称"
                />
                <input
                  className="w-24 flex-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  type="number"
                  value={herb.dosage}
                  onChange={(e) =>
                    updateHerb(i, "dosage", parseFloat(e.target.value) || 0)
                  }
                  placeholder="剂量"
                />
                <span className="text-gray-400 text-sm flex-none">{herb.unit}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeHerb(i)}
                  className="text-red-400 flex-none"
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addHerb} className="mt-3">
            + 添加药材
          </Button>
        </CardContent>
      </Card>

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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>医嘱备注</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none min-h-[80px]"
            value={doctorNotes}
            onChange={(e) => setDoctorNotes(e.target.value)}
            placeholder="输入医嘱或备注信息..."
          />
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-4">
        <Button onClick={saveReview} disabled={saving} variant="outline">
          {saving ? "保存中..." : "保存修改"}
        </Button>
        <Button
          onClick={signPrescription}
          disabled={signing || hasErrors}
          className={hasErrors ? "opacity-50" : ""}
        >
          {signing ? "签发中..." : "签发处方"}
        </Button>
        {hasErrors && (
          <p className="flex items-center text-sm text-red-400">
            存在安全错误，请先修改处方
          </p>
        )}
      </div>
    </div>
  );
}
