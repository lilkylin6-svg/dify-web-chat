<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  createInitialFormValues,
  DIFY_WORKFLOW_DSL,
  getWorkflowInputFields,
} from "./config/chatflow";
import { streamWorkflowResponse } from "./lib/difyStream";
import { useChatStore } from "./stores/chat";

const apiBase = import.meta.env.VITE_API_BASE || "/api/chat";
const chatStore = useChatStore();
const workflowFields = getWorkflowInputFields();
const initialFormValues = createInitialFormValues(workflowFields);
const queryField = workflowFields[0];
const composerValue = ref(initialFormValues[queryField.name] ?? "");
const messagesContainer = ref<HTMLElement | null>(null);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAssistantHtml(content: string) {
  const escaped = escapeHtml(content.trim());
  const quoted = escaped
    .replace(/&gt;\s*「([\s\S]*?)」/g, '<span class="quote-block">[$1]</span>')
    .replace(/「([\s\S]*?)」/g, '<span class="quote-inline">[$1]</span>');

  const withParagraphs = quoted
    .split(/\n{2,}/)
    .map((paragraph: string) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

  return withParagraphs || "<p></p>";
}

onMounted(() => {
  chatStore.initializeFields(workflowFields);
  for (const [name, value] of Object.entries(initialFormValues)) {
    chatStore.setFieldValue(name, value);
  }
});

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick();
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  },
);

const title = computed(() => DIFY_WORKFLOW_DSL.app.name);
const subtitle = computed(() => DIFY_WORKFLOW_DSL.app.description);
const openingStatement = computed(() => DIFY_WORKFLOW_DSL.workflow.features.openingStatement);

async function sendMessage() {
  const query = composerValue.value.trim();
  if (!query) {
    chatStore.setError("请输入问题后再发送。");
    return;
  }

  chatStore.setError("");
  chatStore.setFieldValue(queryField.name, query);
  chatStore.addUserMessage(query);
  chatStore.setLoading(true);

  const assistantId = chatStore.startAssistantMessage();

  try {
    await streamWorkflowResponse({
      apiBase,
      query,
      user: chatStore.sessionId,
      conversationId: chatStore.conversationId || undefined,
      onChunk(text) {
        chatStore.appendAssistantMessage(assistantId, text);
      },
      onReplace(text) {
        chatStore.replaceAssistantMessage(assistantId, text);
      },
      onConversationId(conversationId) {
        chatStore.setConversationId(conversationId);
      },
    });
    composerValue.value = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败，请稍后重试。";
    chatStore.replaceAssistantMessage(assistantId, message);
    chatStore.setError(message);
  } finally {
    chatStore.finishAssistantMessage(assistantId);
    chatStore.setLoading(false);
  }
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (!chatStore.loading) {
      void sendMessage();
    }
  }
}
</script>

<template>
  <div class="page-shell">
    <main class="app-card">
      <section class="hero">
        <h1>{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </section>

      <section class="panel chat-panel">
        <div class="panel-title-row">
          <h2>聊天窗口</h2>
          <span>{{ chatStore.loading ? "回答生成中" : "已就绪" }}</span>
        </div>

        <div ref="messagesContainer" class="messages">
          <div v-if="chatStore.messages.length === 0" class="empty-state">
            <p>{{ openingStatement }}</p>
            <small>直接输入问题即可，页面只展示最终答案。</small>
          </div>

          <article
            v-for="message in chatStore.messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <div class="message-bubble">
              <strong>{{ message.role === "user" ? "你" : "ForJue" }}</strong>
              <div
                v-if="message.role === 'assistant'"
                class="assistant-content"
                v-html="formatAssistantHtml(message.content || (message.streaming ? '思考中...' : ''))"
              />
              <p v-else>{{ message.content }}</p>
            </div>
          </article>
        </div>

        <p v-if="chatStore.error" class="error-text">{{ chatStore.error }}</p>

        <div class="composer">
          <textarea
            v-model="composerValue"
            rows="3"
            :placeholder="queryField.placeholder || '请输入内容'"
            :disabled="chatStore.loading"
            @keydown="onComposerKeydown"
          />
          <button type="button" :disabled="chatStore.loading" @click="sendMessage">
            {{ chatStore.loading ? "发送中..." : "发送" }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #f5f7fb;
  color: #172033;
}

:global(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: #eef2f8;
}

.page-shell {
  min-height: 100vh;
  padding: 32px 16px;
}

.app-card {
  width: min(1080px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 20px;
}

.hero,
.panel {
  background: #ffffff;
  border: 1px solid #e7ecf4;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(23, 32, 51, 0.06);
}

.hero {
  padding: 28px;
}

.hero h1 {
  margin: 0 0 8px;
  font-size: 32px;
}

.subtitle,
.panel-title-row span,
.empty-state small {
  color: #5f6b85;
}

.panel {
  padding: 20px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-title-row h2 {
  margin: 0;
  font-size: 20px;
}

.chat-panel {
  display: grid;
  gap: 16px;
}

.messages {
  min-height: 420px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px;
  border-radius: 18px;
  background: #f7f9fd;
}

.empty-state {
  display: grid;
  place-items: center;
  min-height: 260px;
  text-align: center;
  padding: 24px;
}

.message-row {
  display: flex;
  margin-bottom: 14px;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: min(80%, 760px);
  padding: 14px 16px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e2e8f3;
  line-height: 1.6;
  white-space: pre-wrap;
}

.message-row.user .message-bubble {
  background: #2d6cf6;
  color: #ffffff;
  border-color: #2d6cf6;
}

.message-bubble strong {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.message-bubble p {
  margin: 0;
}

.assistant-content p {
  margin: 0 0 12px;
}

.assistant-content p:last-child {
  margin-bottom: 0;
}

.assistant-content :deep(.quote-block),
.assistant-content :deep(.quote-inline) {
  font-style: italic;
}

.assistant-content :deep(.quote-block) {
  display: block;
  margin: 10px 0;
  color: #44506a;
}

.error-text {
  margin: 0;
  color: #d14343;
}

.composer {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 12px;
}

.composer textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #d4dceb;
  border-radius: 14px;
  outline: none;
  font: inherit;
  background: #fbfcfe;
}

.composer textarea:focus {
  border-color: #6c7cff;
  box-shadow: 0 0 0 4px rgba(108, 124, 255, 0.12);
}

.composer button {
  border: none;
  border-radius: 14px;
  background: #2d6cf6;
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.composer button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

@media (max-width: 720px) {
  .page-shell {
    padding: 16px 12px;
  }

  .hero h1 {
    font-size: 26px;
  }

  .composer {
    grid-template-columns: 1fr;
  }

  .message-bubble {
    max-width: 92%;
  }
}
</style>
