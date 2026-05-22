interface StreamOptions {
  apiBase: string;
  query: string;
  inputs?: Record<string, string>;
  user: string;
  conversationId?: string;
  onChunk: (text: string) => void;
  onReplace: (text: string) => void;
  onConversationId?: (conversationId: string) => void;
}

interface SseEvent {
  event: string;
  data: string;
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readPath(source: unknown, path: string[]) {
  return path.reduce<unknown>((accumulator, key) => {
    if (accumulator && typeof accumulator === "object" && key in accumulator) {
      return (accumulator as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function extractAppendText(event: string, payload: unknown): string | null {
  const candidates: unknown[] = [
    readPath(payload, ["answer"]),
    readPath(payload, ["data", "delta"]),
    readPath(payload, ["data", "text"]),
    readPath(payload, ["text"]),
  ];

  if (["text_chunk", "agent_message", "message"].includes(event)) {
    return candidates.find(
      (item): item is string => typeof item === "string" && item.length > 0,
    ) ?? null;
  }

  return null;
}

function extractFinalText(payload: unknown): string | null {
  const candidates: unknown[] = [
    readPath(payload, ["data", "outputs", "text"]),
    readPath(payload, ["data", "outputs", "answer"]),
    readPath(payload, ["outputs", "text"]),
    readPath(payload, ["outputs", "answer"]),
    readPath(payload, ["answer"]),
    readPath(payload, ["text"]),
  ];

  return candidates.find(
    (item): item is string => typeof item === "string" && item.length > 0,
  ) ?? null;
}

function extractConversationId(payload: unknown): string | null {
  const candidates: unknown[] = [
    readPath(payload, ["conversation_id"]),
    readPath(payload, ["data", "conversation_id"]),
  ];

  return candidates.find(
    (item): item is string => typeof item === "string" && item.length > 0,
  ) ?? null;
}

export async function streamWorkflowResponse(options: StreamOptions) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch(options.apiBase, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: options.query,
        inputs: options.inputs ?? {},
        user: options.user,
        ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const rawText = await response.text();
      let errorMessage = rawText || "代理服务没有返回可读取的数据流。";

      try {
        const parsed = JSON.parse(rawText) as { error?: string };
        if (parsed.error) {
          errorMessage = parsed.error;
        }
      } catch {
        // Keep the raw text when JSON parsing fails.
      }

      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedChunk = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsedEvent = parseSseBlock(block);
        if (!parsedEvent || parsedEvent.data === "[DONE]") {
          continue;
        }

        const payload = tryParseJson(parsedEvent.data);
        const conversationId = extractConversationId(payload);
        if (conversationId) {
          options.onConversationId?.(conversationId);
        }

        const appendText = extractAppendText(parsedEvent.event, payload);
        if (appendText) {
          receivedChunk = true;
          options.onChunk(appendText);
          continue;
        }

        const finalText = extractFinalText(payload);
        if (!receivedChunk && finalText) {
          options.onReplace(finalText);
        }

        if (parsedEvent.event === "error") {
          const message =
            (payload &&
              typeof payload === "object" &&
              "message" in payload &&
              typeof (payload as { message?: unknown }).message === "string" &&
              (payload as { message: string }).message) ||
            finalText ||
            "Dify 返回了错误事件。";
          throw new Error(message);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
