import { z } from "zod";

/**
 * OpenAI 兼容的极简客户端。手写 fetch,零 SDK 依赖。
 * 适配 DeepSeek / Kimi / 通义 / OpenAI 等:只要给对 baseURL + model + key。
 *
 * baseURL 形如 https://api.deepseek.com/v1(结尾不带斜杠)
 */
export const LlmConfigSchema = z.object({
  baseURL: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

const ChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string() }),
    }),
  ),
});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 发起一次对话补全,返回文本内容 */
export async function chat(
  config: LlmConfig,
  messages: readonly ChatMessage[],
  options: { temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.4,
      stream: false,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`大模型请求失败 ${res.status}: ${text.slice(0, 200)}`);
  }

  const json: unknown = await res.json();
  const parsed = ChatResponseSchema.parse(json);
  const first = parsed.choices[0];
  if (!first) throw new Error("大模型返回为空");
  return first.message.content;
}
