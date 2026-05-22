import type { FormField } from "../types/chat";

export const DIFY_WORKFLOW_DSL = {
  app: {
    name: "ForJue",
    mode: "advanced-chat",
    description: "帮助剧粉定位原著剧情，甄别虚假信息",
  },
  workflow: {
    systemInputs: [
      { name: "userinput.query", type: "String" },
      { name: "userinput.files", type: "Array[File]" },
      { name: "sys.conversation_id", type: "String" },
      { name: "sys.user_id", type: "String" },
    ],
    inputFields: [
      {
        name: "query",
        label: "问题",
        type: "textarea",
        required: true,
        placeholder: "请输入你想问《主角》的内容",
        description: "由 DSL 的 `userinput.query` 推导而来，是当前 Chatflow 唯一需要用户输入的字段。",
      },
    ],
    nodes: [
      {
        id: "1779368721342",
        type: "start",
        title: "开始",
        outputs: ["userinput.query", "userinput.files"],
      },
      {
        id: "1779368798294",
        type: "llm",
        title: "索引优化",
        model: "deepseek-ai/DeepSeek-V3",
        output: "text",
      },
      {
        id: "1779368887416",
        type: "knowledge-retrieval",
        title: "知识检索",
        querySource: "userinput.query",
        datasetIds: ["a3141206-f445-4fa4-b5ad-8350f3e3a0b7"],
      },
      {
        id: "llm",
        type: "llm",
        title: "LLM",
        model: "deepseek-ai/DeepSeek-V3",
        contextSource: "知识检索.result",
        output: "text",
      },
      {
        id: "answer",
        type: "answer",
        title: "直接回复",
        answerSource: "LLM.text",
      },
    ],
    edges: [
      { source: "1779368721342", target: "1779368798294" },
      { source: "1779368798294", target: "1779368887416" },
      { source: "1779368887416", target: "llm" },
      { source: "llm", target: "answer" },
    ],
    features: {
      openingStatement: "欢迎各位角儿，大家一起探讨剧情呀~^_^",
      fileUploadEnabled: false,
      retrieverEnabled: true,
    },
  },
} as const;

export function getWorkflowInputFields(): FormField[] {
  return DIFY_WORKFLOW_DSL.workflow.inputFields.map((field) => ({
    ...field,
  }));
}

export function createInitialFormValues(fields: FormField[]) {
  return fields.reduce<Record<string, string>>((accumulator, field) => {
    accumulator[field.name] = field.defaultValue ?? "";
    return accumulator;
  }, {});
}
