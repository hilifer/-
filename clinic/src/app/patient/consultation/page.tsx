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
  const maxRounds = 8;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const startConsultation = async () => {
    setLoading(true);
    const res = await fetch("/api/consultation", { method: "POST" });
    const data = await res.json();
    setConsultationId(data.id);

    // Fetch the first AI message
    const msgRes = await fetch(`/api/consultation/${data.id}/message`);
    const consultation = await msgRes.json();
    setMessages(
      consultation.messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }))
    );
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !consultationId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "USER", content: userMsg }]);
    setLoading(true);

    const res = await fetch(`/api/consultation/${consultationId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: userMsg }),
    });
    const data = await res.json();

    setMessages((prev) => [
      ...prev,
      { role: "ASSISTANT", content: data.aiMessage },
    ]);
    setIsComplete(data.isComplete);
    if (data.currentRound) setCurrentRound(data.currentRound);
    setLoading(false);
  };

  const requestDiagnosis = async () => {
    if (!consultationId) return;
    setDiagnosing(true);

    const res = await fetch(`/api/consultation/${consultationId}/diagnose`, {
      method: "POST",
    });

    if (res.ok) {
      router.push(`/patient/consultation/${consultationId}/diagnosis`);
    }
    setDiagnosing(false);
  };

  // Skip remaining rounds and go to diagnosis
  const skipToDiagnosis = async () => {
    if (!consultationId) return;
    setLoading(true);

    // Tell backend to mark consultation as completed
    const res = await fetch(`/api/consultation/${consultationId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "", skip: true }),
    });

    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "ASSISTANT", content: data.aiMessage },
      ]);
      setIsComplete(true);
    }
    setLoading(false);
  };

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

          {/* Input area */}
          {!isComplete ? (
            <div className="flex gap-2">
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
          ) : (
            <div className="space-y-3">
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
