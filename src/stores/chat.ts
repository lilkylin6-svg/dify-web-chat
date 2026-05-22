import { defineStore } from "pinia";
import type { ChatMessage, FormField } from "../types/chat";

interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  formValues: Record<string, string>;
  loading: boolean;
  error: string;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useChatStore = defineStore("chat", {
  state: (): ChatState => ({
    sessionId: createId(),
    messages: [],
    formValues: {},
    loading: false,
    error: "",
  }),
  actions: {
    initializeFields(fields: FormField[]) {
      for (const field of fields) {
        if (!(field.name in this.formValues)) {
          this.formValues[field.name] = field.defaultValue ?? "";
        }
      }
    },
    setFieldValue(name: string, value: string) {
      this.formValues[name] = value;
    },
    addUserMessage(content: string) {
      this.messages.push({
        id: createId(),
        role: "user",
        content,
      });
    },
    startAssistantMessage() {
      const id = createId();
      this.messages.push({
        id,
        role: "assistant",
        content: "",
        streaming: true,
      });
      return id;
    },
    appendAssistantMessage(id: string, chunk: string) {
      const message = this.messages.find((item) => item.id === id);
      if (message) {
        message.content += chunk;
      }
    },
    replaceAssistantMessage(id: string, content: string) {
      const message = this.messages.find((item) => item.id === id);
      if (message) {
        message.content = content;
      }
    },
    finishAssistantMessage(id: string) {
      const message = this.messages.find((item) => item.id === id);
      if (message) {
        message.streaming = false;
      }
    },
    setLoading(value: boolean) {
      this.loading = value;
    },
    setError(message: string) {
      this.error = message;
    },
  },
});
