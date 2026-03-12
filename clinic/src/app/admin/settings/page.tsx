"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultBaseUrl: "",
    models: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-5-20251001",
      "claude-opus-4-20250514",
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek (深度求索)",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "kimi",
    label: "Kimi (月之暗面)",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    models: ["kimi-k2.5", "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
  },
  {
    id: "qwen",
    label: "通义千问 (阿里)",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4", "glm-4-flash"],
  },
  {
    id: "baichuan",
    label: "百川智能",
    defaultBaseUrl: "https://api.baichuan-ai.com/v1",
    models: ["Baichuan4", "Baichuan3-Turbo"],
  },
  {
    id: "spark",
    label: "讯飞星火",
    defaultBaseUrl: "https://spark-api-open.xf-yun.com/v1",
    models: ["generalv3.5", "4.0Ultra"],
  },
  { id: "custom", label: "自定义 (兼容 OpenAI API)", defaultBaseUrl: "", models: [] },
];

// TCM-specific system prompts
const SYSTEM_PROMPTS = {
  consultation: {
    label: "问诊对话提示词",
    prompt: `你是「杏林智诊」平台的AI中医问诊助手，拥有扎实的中医基础理论和丰富的临床辨证经验。

## 角色定位
- 你是一位和蔼、专业的中医师，正在对患者进行初诊问诊
- 你的目标是通过8轮对话，系统收集四诊（望闻问切）信息

## 问诊流程（共8轮）
第1轮：主诉与病程 — 询问主要不适症状、发病时间、起因
第2轮：症状性质 — 疼痛性质、部位、加重/缓解因素
第3轮：伴随症状 — 有无发热、头晕、乏力等其他不适
第4轮：饮食与口感 — 食欲、口渴、口苦/口甜、喜冷饮/热饮
第5轮：睡眠情况 — 入睡难易、多梦、早醒、睡眠时长
第6轮：二便情况 — 大便次数/性状、小便颜色/频次
第7轮：情志与体质 — 情绪状态、怕冷/怕热、出汗情况、月经（女性）
第8轮：既往史 — 过敏史、既往疾病、目前用药、家族病史

## 问诊规则
1. 每轮只问1-2个问题，不要一次性问太多
2. 语言通俗易懂，避免使用患者难以理解的专业术语
3. 对患者的回答要有简短的回应和小结，再引出下一个问题
4. 注意倾听，对患者提到的关键症状要追问细节
5. 态度温和亲切，体现对患者的关心
6. 当前是第{round}轮问诊，共{maxRounds}轮，{remainingHint}
7. 回复控制在100字以内`,
  },
  diagnosis: {
    label: "辨证分析提示词",
    prompt: `你是「杏林智诊」平台的AI中医辨证分析引擎。请根据问诊对话记录进行专业的辨证分析。

## 辨证要求
1. 综合四诊信息，运用八纲辨证（阴阳表里寒热虚实）进行分析
2. 可结合脏腑辨证、气血津液辨证等方法
3. 证型判断要有据可依，说明推理过程
4. 处方选方要经典、合理，药物剂量符合《中国药典》规定

## 输出格式
严格按以下JSON格式返回（不要包含其他文字）：
{
  "syndromeType": "证型名称（如：肝郁脾虚证）",
  "confidence": 0.85,
  "reasoning": "辨证推理过程（200字以内，说明依据哪些症状得出该证型）",
  "recommendedFormula": "方剂名称（如：逍遥散）",
  "formulaHerbs": [
    {"name": "柴胡", "dosage": 9, "unit": "g"},
    {"name": "白芍", "dosage": 12, "unit": "g"}
  ]
}

## 注意事项
- confidence 为0-1之间的浮点数，反映辨证把握度
- 处方一般6-12味药，剂量合理
- 有毒药物（附子、半夏等）需注明
- 此为AI辅助意见，最终以医师审核为准`,
  },
};

interface ProviderSavedConfig {
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tested: boolean;
}

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
  providers?: Record<string, ProviderSavedConfig>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [newApiKey, setNewApiKey] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Connection test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testSuccess, setTestSuccess] = useState(false);
  const [testDetails, setTestDetails] = useState<string[]>([]);
  const [testHint, setTestHint] = useState("");
  const [testLatency, setTestLatency] = useState("");

  // Chat test
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Client-side validation
  function validate(cfg: AiConfig, apiKeyInput: string): string[] {
    const errors: string[] = [];
    if (!cfg.provider) errors.push("请选择模型提供商");
    if (!cfg.model || cfg.model.trim() === "") errors.push("请选择或输入模型名称");

    const hasKey = apiKeyInput.trim().length > 0 || cfg.hasApiKey;
    if (!hasKey) errors.push("请配置 API Key");

    if (
      !["openai", "anthropic"].includes(cfg.provider) &&
      (!cfg.baseUrl || cfg.baseUrl.trim() === "")
    ) {
      errors.push("该提供商需要填写 API 地址");
    }

    if (cfg.baseUrl && cfg.baseUrl.trim() !== "") {
      try {
        new URL(cfg.baseUrl);
      } catch {
        errors.push("API 地址格式不正确");
      }
    }
    return errors;
  }

  // Toggle AI enable/disable — auto-saves on disable
  async function handleToggleEnable() {
    if (!config) return;

    if (config.enabled) {
      // Disabling — auto-save immediately
      const disabledConfig = { ...config, enabled: false };
      setConfig(disabledConfig);
      setValidationErrors([]);

      const payload = {
        ...disabledConfig,
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
        setMessage("已关闭大模型，已切换到规则引擎模式");
        setMessageType("success");
      }
      return;
    }

    // Enabling — validate first
    const errors = validate(config, newApiKey);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setConfig({ ...config, enabled: true });
  }

  const save = async () => {
    if (!config) return;

    // If enabling, validate again before save
    if (config.enabled) {
      const errors = validate(config, newApiKey);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setMessage("请先完成必要配置");
        setMessageType("error");
        return;
      }
    }

    setSaving(true);
    setMessage("");
    setValidationErrors([]);

    const payload = {
      ...config,
      apiKey: newApiKey || config.apiKey,
    };

    const res = await fetch("/api/admin/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      setConfig(data);
      setNewApiKey("");
      setMessage("保存成功");
      setMessageType("success");
    } else {
      // Server-side validation errors
      if (data.details) {
        setValidationErrors(data.details);
      }
      setMessage(data.error || "保存失败");
      setMessageType("error");
    }
    setSaving(false);
  };

  // Connection test
  const testConnection = async () => {
    setTesting(true);
    setTestResult("");
    setTestDetails([]);
    setTestHint("");
    setTestLatency("");

    const res = await fetch("/api/admin/ai-config/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    setTestSuccess(!!data.success);
    if (data.success) {
      setTestResult(data.message);
      setTestLatency(data.latency || "");
    } else {
      setTestResult(data.error || "测试失败");
      // Merge config diagnostics + API error details
      const allDetails = [
        ...(data.details || []),
        ...(data.errorDetails || []),
      ];
      setTestDetails(allDetails);
      setTestHint(data.hint || "");
    }
    setTesting(false);
  };

  // Chat test
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);

    const res = await fetch("/api/admin/ai-config/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: updated.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await res.json();
    if (data.success && data.reply) {
      setChatMessages([...updated, { role: "assistant", content: data.reply }]);
    } else {
      setChatMessages([
        ...updated,
        {
          role: "assistant",
          content: "[错误] " + (data.error || "请求失败，请检查配置"),
        },
      ]);
    }
    setChatLoading(false);
  };

  const currentProvider = PROVIDERS.find((p) => p.id === config?.provider);

  // Auto-fill system prompt
  const applySystemPrompt = (key: keyof typeof SYSTEM_PROMPTS) => {
    if (!config) return;
    setConfig({ ...config, systemPrompt: SYSTEM_PROMPTS[key].prompt });
  };

  if (!session || !config) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-emerald-400">加载中...</div>
      </div>
    );
  }

  const needsBaseUrl = !["openai", "anthropic"].includes(config.provider);
  const hasUnsavedKey = newApiKey.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-emerald-400">
        AI 大模型设置
      </h1>

      {/* Validation errors banner */}
      {validationErrors.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3">
          <div className="text-sm font-medium text-red-400 mb-2">
            启用大模型前请完成以下配置：
          </div>
          <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

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
            onClick={handleToggleEnable}
          >
            {config.enabled ? "关闭大模型" : "启用大模型"}
          </Button>
        </CardContent>
      </Card>

      {/* Provider selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            模型提供商 <span className="text-red-400 text-sm">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {PROVIDERS.map((p) => {
              const saved = config.providers?.[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    // Load saved provider config if available
                    if (saved) {
                      setConfig({
                        ...config,
                        provider: p.id,
                        model: saved.model || p.models[0] || config.model,
                        baseUrl: saved.baseUrl || p.defaultBaseUrl || "",
                        temperature: saved.temperature ?? config.temperature,
                        maxTokens: saved.maxTokens ?? config.maxTokens,
                        systemPrompt: saved.systemPrompt ?? config.systemPrompt,
                        apiKey: saved.apiKey,
                        hasApiKey: saved.hasApiKey,
                      });
                      setNewApiKey("");
                    } else {
                      setConfig({
                        ...config,
                        provider: p.id,
                        model: p.models[0] || config.model,
                        baseUrl: p.defaultBaseUrl || (p.id === "custom" ? config.baseUrl : ""),
                      });
                    }
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    config.provider === p.id
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {saved?.tested && (
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="已测试通过" />
                    )}
                    {saved?.hasApiKey && !saved?.tested && (
                      <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" title="已配置密钥" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.models.length > 0 ? p.models.join(", ") : "自定义模型"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Model selection */}
          {currentProvider && currentProvider.models.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                模型 <span className="text-red-400">*</span>
              </label>
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
              <label className="block text-sm text-gray-400 mb-2">
                模型名称 <span className="text-red-400">*</span>
              </label>
              <Input
                value={config.model}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
                placeholder="例如: qwen-plus, glm-4"
              />
            </div>
          )}

          {/* Custom base URL */}
          {needsBaseUrl && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                API 地址 <span className="text-red-400">*</span>
              </label>
              <Input
                value={config.baseUrl}
                onChange={(e) =>
                  setConfig({ ...config, baseUrl: e.target.value })
                }
                placeholder="https://api.example.com/v1"
              />
              <p className="text-xs text-gray-500 mt-1">
                需要兼容 OpenAI 的 /chat/completions 接口
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Key */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            API Key <span className="text-red-400 text-sm">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config.hasApiKey && (
            <p className="text-sm text-gray-400 mb-2">
              当前密钥:{" "}
              <span className="text-emerald-400 font-mono">
                {config.apiKey}
              </span>
              {hasUnsavedKey && (
                <span className="text-yellow-400 ml-2">(将被替换)</span>
              )}
            </p>
          )}
          <Input
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder={
              config.hasApiKey ? "输入新密钥以替换..." : "输入 API Key..."
            }
          />
          <p className="text-xs text-gray-500 mt-2">
            密钥安全存储在数据库中，前端仅显示末4位。保存后生效。
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
                  setConfig({
                    ...config,
                    temperature: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>精确 (0)</span>
                <span>创造 (2)</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                中医问诊建议 0.5-0.8，辨证分析建议 0.3-0.6
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                最大 Tokens
              </label>
              <Input
                type="number"
                min={256}
                max={32768}
                value={config.maxTokens}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxTokens: parseInt(e.target.value) || 2048,
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                范围 256-32768，问诊对话建议 1024-2048
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System prompt with auto-fill templates */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>系统提示词</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-sm text-gray-400 self-center">
              一键填充：
            </span>
            {Object.entries(SYSTEM_PROMPTS).map(([key, { label }]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() =>
                  applySystemPrompt(key as keyof typeof SYSTEM_PROMPTS)
                }
              >
                {label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig({ ...config, systemPrompt: "" })}
            >
              清空
            </Button>
          </div>

          <textarea
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none min-h-[200px] text-sm font-mono"
            value={config.systemPrompt}
            onChange={(e) =>
              setConfig({ ...config, systemPrompt: e.target.value })
            }
            placeholder="自定义系统提示词（留空使用默认内置提示词）"
          />
          <p className="text-xs text-gray-500 mt-1">
            支持 {"{round}"} 占位符（自动替换为当前问诊轮次）。留空时使用内置默认提示词。
          </p>
        </CardContent>
      </Card>

      {/* Save and test actions */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存设置"}
            </Button>
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing}
              title="发送测试请求，检查配置是否正确"
            >
              {testing ? "测试中..." : "测试连接"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setChatOpen(!chatOpen);
                if (!chatOpen) setChatMessages([]);
              }}
              disabled={!config.enabled}
              title={
                !config.enabled
                  ? "请先启用并保存大模型配置"
                  : "打开对话测试面板"
              }
            >
              {chatOpen ? "关闭对话测试" : "对话测试"}
            </Button>
          </div>

          {/* Status messages */}
          {message && (
            <p
              className={`mt-3 text-sm ${
                messageType === "success" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {message}
            </p>
          )}
          {testResult && (
            <div
              className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                testSuccess
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-red-500/50 bg-red-500/10"
              }`}
            >
              {testSuccess ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-400 font-medium mb-2">
                    <span>连接成功</span>
                    {testLatency && (
                      <span className="text-xs text-emerald-500/70">({testLatency})</span>
                    )}
                  </div>
                  <div className="text-emerald-300/80">{testResult}</div>
                </>
              ) : (
                <>
                  <div className="text-red-400 font-medium mb-2">连接失败</div>
                  <div className="text-red-300/80 mb-2">{testResult}</div>
                  {testDetails.length > 0 && (
                    <div className="mt-2 border-t border-red-500/20 pt-2">
                      <div className="text-red-400/80 text-xs font-medium mb-1">问题诊断：</div>
                      <ul className="list-disc list-inside text-red-300/70 text-xs space-y-1">
                        {testDetails.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {testHint && (
                    <div className="mt-2 border-t border-red-500/20 pt-2">
                      <div className="text-yellow-400/80 text-xs whitespace-pre-line">
                        <span className="font-medium">建议：</span>{testHint}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat test panel */}
      {chatOpen && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>对话测试</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChatMessages([])}
              >
                清空对话
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-gray-700 bg-gray-900 min-h-[300px] max-h-[500px] overflow-y-auto mb-3 p-3">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-500 mt-12">
                  <p className="mb-2">输入消息测试大模型对话效果</p>
                  <p className="text-xs">
                    试试问：&ldquo;我最近经常失眠多梦，白天没精神&rdquo;
                  </p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`mb-3 flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white"
                        : msg.content.startsWith("[错误]")
                        ? "bg-red-900/50 text-red-300 border border-red-500/30"
                        : "bg-gray-800 text-gray-200"
                    }`}
                  >
                    <div className="text-xs mb-1 opacity-60">
                      {msg.role === "user" ? "你" : "AI助手"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start mb-3">
                  <div className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-400">
                    <div className="text-xs mb-1 opacity-60">AI助手</div>
                    思考中...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="输入测试消息..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                disabled={chatLoading}
              />
              <Button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
              >
                发送
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config summary */}
      <Card>
        <CardHeader>
          <CardTitle>当前配置摘要</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-500">状态</span>
            <span className={config.enabled ? "text-emerald-400" : "text-red-400"}>
              {config.enabled ? "已启用" : "已关闭（使用规则引擎）"}
            </span>
            <span className="text-gray-500">提供商</span>
            <span className="text-gray-300">
              {PROVIDERS.find((p) => p.id === config.provider)?.label ||
                config.provider}
            </span>
            <span className="text-gray-500">模型</span>
            <span className="text-gray-300">{config.model}</span>
            <span className="text-gray-500">API Key</span>
            <span className="text-gray-300">
              {config.hasApiKey ? config.apiKey : "未配置"}
            </span>
            {needsBaseUrl && (
              <>
                <span className="text-gray-500">API 地址</span>
                <span className="text-gray-300">
                  {config.baseUrl || "未配置"}
                </span>
              </>
            )}
            <span className="text-gray-500">Temperature</span>
            <span className="text-gray-300">{config.temperature}</span>
            <span className="text-gray-500">最大 Tokens</span>
            <span className="text-gray-300">{config.maxTokens}</span>
            <span className="text-gray-500">系统提示词</span>
            <span className="text-gray-300">
              {config.systemPrompt
                ? `已配置（${config.systemPrompt.length}字）`
                : "使用默认"}
            </span>
          </div>

          {/* Configured providers summary */}
          {config.providers && Object.keys(config.providers).length > 0 && (
            <div className="mt-4 border-t border-gray-700 pt-4">
              <div className="text-sm text-gray-400 mb-2">已配置的提供商：</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(config.providers).map(([id, pc]) => {
                  const label = PROVIDERS.find((p) => p.id === id)?.label || id;
                  return (
                    <span
                      key={id}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                        pc.tested
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : pc.hasApiKey
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                          : "bg-gray-800 text-gray-500 border border-gray-700"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          pc.tested
                            ? "bg-emerald-400"
                            : pc.hasApiKey
                            ? "bg-yellow-400"
                            : "bg-gray-600"
                        }`}
                      />
                      {label}
                      {pc.tested ? " (已测试)" : pc.hasApiKey ? " (已配置)" : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
