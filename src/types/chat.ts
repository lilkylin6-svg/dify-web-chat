export type FieldKind = "input" | "textarea" | "select";

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormField {
  name: string;
  label: string;
  type: FieldKind;
  required: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  defaultValue?: string;
  description?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}
