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
const systemInputs = computed(() => DIFY_WORKFLOW_DSL.workflow.systemInputs);

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
        <p class="eyebrow">Vue 3 + Vite + Pinia + Vercel Proxy</p>
        <h1>{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
        <p class="hint">工作流链路：开始 -> 索引优化 -> 知识检索 -> LLM -> 直接回复</p>
      </section>

      <section class="panel workflow-panel">
        <div class="panel-title-row">
          <h2>输入结构</h2>
          <span>来自 DSL 起始节点</span>
        </div>
        <div class="pill-list">
          <span v-for="item in systemInputs" :key="item.name" class="pill">
            {{ item.name }} / {{ item.type }}
          </span>
        </div>
        <p class="note">
          当前真正需要用户提供的只有 <code>userinput.query</code>，其余字段由 Dify 运行时自动注入，鉴权由后端
          <code>/api/chat</code> 代理统一处理。
        </p>
      </section>

      <section class="panel chat-panel">
        <div class="panel-title-row">
          <h2>聊天窗口</h2>
          <span>SSE 流式响应</span>
        </div>

        <div ref="messagesContainer" class="messages">
          <div v-if="chatStore.messages.length === 0" class="empty-state">
            <p>{{ openingStatement }}</p>
            <small>直接输入你的问题，前端会把它映射为 `query`，再由后端代理转发到 Dify Chatflow。</small>
          </div>

          <article
            v-for="message in chatStore.messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <div class="message-bubble">
              <strong>{{ message.role === "user" ? "你" : "ForJue" }}</strong>
              <p>{{ message.content || (message.streaming ? "思考中..." : "") }}</p>
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
  margin: 8px 0;
  font-size: 32px;
}

.subtitle,
.hint,
.eyebrow,
.panel-title-row span,
.empty-state small,
.note {
  color: #5f6b85;
}

.eyebrow {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
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

.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pill {
  padding: 8px 12px;
  border-radius: 999px;
  background: #f3f6fc;
  color: #31405f;
  font-size: 14px;
}

.note {
  margin-bottom: 0;
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
