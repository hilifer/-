"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AIBanner } from "@/components/ai-banner";

interface ChatMessage {
  role: "USER" | "ASSISTANT";
  content: string;
}

interface UploadedImage {
  type: "TONGUE" | "FACE" | "FINGER";
  preview: string; // data URL for display
  uploading?: boolean;
  uploaded?: boolean;
}

const IMAGE_TYPES = [
  { type: "TONGUE" as const, label: "舌诊", desc: "拍摄舌头正面照片" },
  { type: "FACE" as const, label: "面诊", desc: "拍摄面部正面照片" },
  { type: "FINGER" as const, label: "指纹", desc: "拍摄手指指纹照片" },
];

// Compress image client-side to stay within upload limits
function compressImage(file: File, maxWidth = 1024, quality = 0.8): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const mimeType = "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, quality);
      resolve({ dataUrl, mimeType });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ConsultationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [error, setError] = useState("");
  const maxRounds = 8;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Image upload state
  const [images, setImages] = useState<Record<string, UploadedImage>>({});
  const [imagePanel, setImagePanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageTypeRef = useRef<"TONGUE" | "FACE" | "FINGER">("TONGUE");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const startConsultation = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/consultation", { method: "POST" });
      if (!res.ok) throw new Error("创建问诊失败");
      const data = await res.json();
      setConsultationId(data.id);

      // Fetch the first AI message
      const msgRes = await fetch(`/api/consultation/${data.id}/message`);
      if (!msgRes.ok) {
        const errData = await msgRes.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || `获取问诊消息失败 (${msgRes.status})`);
      }
      const consultation = await msgRes.json();
      if (consultation.messages) {
        setMessages(
          consultation.messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          }))
        );
      }
    } catch (err) {
      console.error("startConsultation error:", err);
      setError(err instanceof Error ? err.message : "初始化问诊失败，请刷新重试");
      setConsultationId(null);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !consultationId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "USER", content: userMsg }]);
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/consultation/${consultationId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "发送失败");
      }
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: "ASSISTANT", content: data.aiMessage },
      ]);
      setIsComplete(data.isComplete);
      if (data.currentRound) setCurrentRound(data.currentRound);
    } catch (err) {
      console.error("sendMessage error:", err);
      setError(err instanceof Error ? err.message : "发送失败，请重试");
      // Remove the optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const requestDiagnosis = async () => {
    if (!consultationId) return;
    setDiagnosing(true);
    setError("");

    try {
      const res = await fetch(`/api/consultation/${consultationId}/diagnose`, {
        method: "POST",
      });

      if (res.ok) {
        router.push(`/patient/consultation/${consultationId}/diagnosis`);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "辨证分析失败");
      }
    } catch (err) {
      console.error("requestDiagnosis error:", err);
      setError(err instanceof Error ? err.message : "辨证分析失败，请重试");
    } finally {
      setDiagnosing(false);
    }
  };

  // Skip remaining rounds and go to diagnosis
  const skipToDiagnosis = async () => {
    if (!consultationId) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/consultation/${consultationId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "", skip: true }),
      });

      if (!res.ok) throw new Error("跳过失败");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "ASSISTANT", content: data.aiMessage },
      ]);
      setIsComplete(true);
    } catch (err) {
      console.error("skipToDiagnosis error:", err);
      setError(err instanceof Error ? err.message : "跳过失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // Image upload handler — use ref to avoid stale closure
  const handleImageSelect = (type: "TONGUE" | "FACE" | "FINGER") => {
    activeImageTypeRef.current = type;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !consultationId) return;

    // Capture the type from ref immediately
    const imageType = activeImageTypeRef.current;

    // Validate
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("请上传 JPG、PNG 或 WebP 格式的图片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("图片大小不能超过 5MB");
      return;
    }

    // Compress and convert to base64
    const { dataUrl, mimeType } = await compressImage(file);
    const base64 = dataUrl.split(",")[1];

    // Show preview immediately
    setImages((prev) => ({
      ...prev,
      [imageType]: {
        type: imageType,
        preview: dataUrl,
        uploading: true,
        uploaded: false,
      },
    }));

    try {
      // Upload to backend
      const res = await fetch(
        `/api/consultation/${consultationId}/image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: imageType,
            data: base64,
            mimeType,
          }),
        }
      );

      if (res.ok) {
        setImages((prev) => ({
          ...prev,
          [imageType]: {
            ...prev[imageType],
            uploading: false,
            uploaded: true,
          },
        }));
      } else {
        let errMsg = "上传失败";
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch { /* ignore parse error */ }
        alert(errMsg);
        setImages((prev) => {
          const next = { ...prev };
          delete next[imageType];
          return next;
        });
      }
    } catch (err) {
      console.error("Image upload error:", err);
      alert("上传失败，请检查网络或图片大小（最大5MB）");
      setImages((prev) => {
        const next = { ...prev };
        delete next[imageType];
        return next;
      });
    }

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const removeImage = (type: string) => {
    setImages((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  };

  const uploadedCount = Object.values(images).filter((i) => i.uploaded).length;

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-emerald-400">AI智能问诊</h1>

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-2 text-red-400/60 hover:text-red-400">×</button>
          </div>
        </div>
      )}

      {!consultationId ? (
        <Card className="text-center py-12">
          <p className="mb-6 text-gray-400">
            开始AI问诊，系统将通过8轮对话收集您的症状信息
          </p>
          <Button onClick={startConsultation} disabled={loading} size="lg">
            {loading ? "正在初始化..." : "开始问诊"}
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col h-[70vh]">
          {/* Round progress */}
          {!isComplete && currentRound > 0 && (
            <div className="mb-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>问诊进度</span>
                  <span>第 {currentRound} / {maxRounds} 轮</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${(currentRound / maxRounds) * 100}%` }}
                  />
                </div>
              </div>
              {currentRound >= 3 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={skipToDiagnosis}
                  disabled={loading}
                  className="text-xs whitespace-nowrap"
                >
                  跳过，直接诊断
                </Button>
              )}
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "USER"
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-800 text-gray-200"
                  }`}
                >
                  {msg.role === "ASSISTANT" && (
                    <span className="mb-1 block text-xs text-emerald-400">
                      问诊助手
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-2xl px-4 py-3 text-gray-400">
                  正在思考...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Image upload panel */}
          {imagePanel && (
            <div className="mb-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">
                  上传望诊照片（可选）
                </span>
                <button
                  onClick={() => setImagePanel(false)}
                  className="text-gray-500 hover:text-gray-300 text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {IMAGE_TYPES.map(({ type, label, desc }) => {
                  const img = images[type];
                  return (
                    <div key={type} className="relative">
                      {img ? (
                        <div className="relative group">
                          <img
                            src={img.preview}
                            alt={label}
                            className="w-full h-24 object-cover rounded-lg border border-gray-600"
                          />
                          {img.uploading && (
                            <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                              <span className="text-xs text-white">上传中...</span>
                            </div>
                          )}
                          {img.uploaded && (
                            <div className="absolute top-1 right-1 bg-emerald-500 rounded-full w-5 h-5 flex items-center justify-center text-white text-xs">
                              ✓
                            </div>
                          )}
                          <button
                            onClick={() => removeImage(type)}
                            className="absolute top-1 left-1 bg-red-600 rounded-full w-5 h-5 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                          <div className="text-center text-xs text-gray-400 mt-1">{label}</div>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleImageSelect(type)}
                          className="w-full h-24 rounded-lg border-2 border-dashed border-gray-600 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-1 transition-colors"
                        >
                          <span className="text-2xl text-gray-500">+</span>
                          <span className="text-xs text-gray-400">{label}</span>
                          <span className="text-[10px] text-gray-500">{desc}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {uploadedCount > 0 && (
                <p className="text-xs text-emerald-400/70 mt-2">
                  已上传 {uploadedCount} 张照片，将在辨证分析时参考
                </p>
              )}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Input area */}
          {!isComplete ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImagePanel(!imagePanel)}
                  className="shrink-0 text-xs"
                >
                  {imagePanel ? "收起照片" : `望诊照片${uploadedCount > 0 ? ` (${uploadedCount})` : ""}`}
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="请描述您的症状..."
                  disabled={loading}
                />
                <Button onClick={sendMessage} disabled={loading || !input.trim()}>
                  发送
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Show image upload in complete state too */}
              {!imagePanel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImagePanel(true)}
                  className="text-xs"
                >
                  {`上传望诊照片${uploadedCount > 0 ? ` (已上传${uploadedCount}张)` : "（可选，辅助诊断）"}`}
                </Button>
              )}
              <AIBanner />
              <Button
                onClick={requestDiagnosis}
                disabled={diagnosing}
                size="lg"
                className="w-full"
              >
                {diagnosing ? "正在辨证分析中..." : "获取AI辨证结果"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
