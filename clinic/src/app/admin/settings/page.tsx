"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { id: "anthropic", label: "Anthropic (Claude)", models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-opus-4-20250514"] },
  { id: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "custom", label: "自定义 (兼容 OpenAI API)", models: [] },
];

const DEFAULT_SYSTEM_PROMPT = `你是一位经验丰富的中医师AI助手，负责辅助中医问诊。你的任务是：
1. 通过多轮对话，收集患者的四诊信息（望闻问切）
2. 根据收集的信息进行辨证分型
3. 推荐合适的方剂和药材组合

注意事项：
- 每次只问1-2个问题，循序渐进
- 使用通俗易懂的中文与患者交流
- 所有诊断仅供参考，最终以医师审核为准
- 回答要专业但亲切`;

interface AiConfig {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session && session.user.role !== "ADMIN") router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/admin/ai-config")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setConfig(data);
      });
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMessage("");

    const payload = {
      ...config,
      apiKey: newApiKey || config.apiKey,
    };

    const res = await fetch("/api/admin/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      setConfig(data);
      setNewApiKey("");
      setMessage("保存成功");
    } else {
      setMessage("保存失败");
    }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult("");

    const res = await fetch("/api/admin/ai-config/test", { method: "POST" });
    const data = await res.json();

    setTestResult(data.success ? "连接成功: " + data.message : "连接失败: " + data.error);
    setTesting(false);
  };

  const currentProvider = PROVIDERS.find((p) => p.id === config?.provider);

  if (!session || !config) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-emerald-400">AI 大模型设置</h1>

      {/* Enable/Disable toggle */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>AI 大模型辅助</span>
            <Badge variant={config.enabled ? "default" : "error"}>
              {config.enabled ? "已启用" : "已关闭"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 mb-4">
            {config.enabled
              ? "当前使用大模型进行问诊和辨证分析。关闭后将回退到内置规则引擎。"
              : "当前使用内置规则引擎（关键词匹配）。启用后将调用大模型API进行问诊。"}
          </p>
          <Button
            variant={config.enabled ? "destructive" : "default"}
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
          >
            {config.enabled ? "关闭大模型" : "启用大模型"}
          </Button>
        </CardContent>
      </Card>

      {/* Provider selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>模型提供商</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  setConfig({
                    ...config,
                    provider: p.id,
                    model: p.models[0] || config.model,
                    baseUrl: p.id === "deepseek" ? "https://api.deepseek.com/v1" : "",
                  })
                }
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  config.provider === p.id
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
                }`}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {p.models.length > 0 ? p.models.join(", ") : "自定义模型"}
                </div>
              </button>
            ))}
          </div>

          {/* Model selection */}
          {currentProvider && currentProvider.models.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">模型</label>
              <div className="flex flex-wrap gap-2">
                {currentProvider.models.map((m) => (
                  <button
                    key={m}
                    onClick={() => setConfig({ ...config, model: m })}
                    className={`rounded-md px-3 py-1 text-sm transition-colors ${
                      config.model === m
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom model name */}
          {config.provider === "custom" && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">模型名称</label>
              <Input
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="例如: qwen-plus"
              />
            </div>
          )}

          {/* Custom base URL */}
          {(config.provider === "custom" || config.provider === "deepseek") && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">API 地址</label>
              <Input
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Key */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>API Key</CardTitle>
        </CardHeader>
        <CardContent>
          {config.hasApiKey && (
            <p className="text-sm text-gray-400 mb-2">
              当前密钥: <span className="text-emerald-400 font-mono">{config.apiKey}</span>
            </p>
          )}
          <Input
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder={config.hasApiKey ? "输入新密钥以替换..." : "输入 API Key..."}
          />
          <p className="text-xs text-gray-500 mt-2">
            密钥安全存储在数据库中，前端仅显示末4位。
          </p>
        </CardContent>
      </Card>

      {/* Parameters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>模型参数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Temperature: {config.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) =>
                  setConfig({ ...config, temperature: parseFloat(e.target.value) })
                }
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>精确 (0)</span>
                <span>创造 (2)</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">最大 Tokens</label>
              <Input
                type="number"
                value={config.maxTokens}
                onChange={(e) =>
                  setConfig({ ...config, maxTokens: parseInt(e.target.value) || 2048 })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System prompt */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>系统提示词</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig({ ...config, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            >
              恢复默认
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none min-h-[160px] text-sm font-mono"
            value={config.systemPrompt}
            onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
            placeholder="自定义系统提示词（留空使用默认）"
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "保存中..." : "保存设置"}
        </Button>
        <Button
          variant="outline"
          onClick={testConnection}
          disabled={testing || !config.enabled}
        >
          {testing ? "测试中..." : "测试连接"}
        </Button>
        {message && (
          <span className={`text-sm ${message.includes("成功") ? "text-emerald-400" : "text-red-400"}`}>
            {message}
          </span>
        )}
        {testResult && (
          <span className={`text-sm ${testResult.includes("成功") ? "text-emerald-400" : "text-red-400"}`}>
            {testResult}
          </span>
        )}
      </div>
    </div>
  );
}
