export const config = {
  runtime: "nodejs",
};

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/\/v1$/i, "");
}

function buildChatMessagesUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/v1/chat-messages`;
}

async function readJsonBody(req) {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function getReadableError(rawText, fallback) {
  if (!rawText) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message;
    }
    if (typeof parsed.error === "string" && parsed.error) {
      return parsed.error;
    }
  } catch {
    // Keep the raw text when the upstream response is not JSON.
  }

  return rawText;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.DIFY_API_KEY;
  const baseUrl = process.env.DIFY_BASE_URL;

  if (!apiKey || !baseUrl) {
    sendJson(res, 500, {
      error: "缺少 Dify 环境变量，请配置 DIFY_API_KEY 与 DIFY_BASE_URL。",
    });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "请求体不是合法的 JSON。" });
    return;
  }

  const inputs =
    payload?.inputs && typeof payload.inputs === "object" && !Array.isArray(payload.inputs)
      ? payload.inputs
      : {};
  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  const user = typeof payload?.user === "string" && payload.user ? payload.user : "anonymous-user";
  const conversationId =
    typeof payload?.conversation_id === "string" && payload.conversation_id
      ? payload.conversation_id
      : undefined;

  if (!query) {
    sendJson(res, 400, { error: "缺少 query，Chatflow 请求必须包含用户问题。" });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    const upstream = await fetch(buildChatMessagesUrl(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        query,
        inputs,
        response_mode: "streaming",
        user,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      sendJson(res, upstream.status, {
        error: getReadableError(errorText, "Dify 请求失败。"),
      });
      return;
    }

    if (!upstream.body) {
      sendJson(res, 502, { error: "Dify 没有返回可读取的数据流。" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = upstream.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        res.write(Buffer.from(value));
      }
    }

    res.end();
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "请求 Dify 超时，请稍后重试。"
        : error instanceof Error
          ? error.message
          : "代理服务请求失败。";

    if (!res.headersSent) {
      sendJson(res, 500, { error: message });
      return;
    }

    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  } finally {
    clearTimeout(timeoutId);
  }
}
