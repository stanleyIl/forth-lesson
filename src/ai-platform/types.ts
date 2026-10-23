export type RetrievalMode = "none" | "keyword" | "vector" | "hybrid";
export type SkillType = "instruction" | "server_action";

export type PromptTemplateVersion = {
  id: string;
  templateId: string;
  classId: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  body: string;
  variables: string[];
};

export type BoundSkill = {
  skillId: string;
  versionId: string;
  skillKey: string;
  name: string;
  semanticVersion: string;
  type: SkillType;
  actionName?: string;
  instructionBody: string;
  options: Record<string, unknown>;
  position: number;
};

export type BoundTool = {
  toolId: string;
  serverId: string;
  serverKey: string;
  endpointUrl: string;
  toolName: string;
  normalizedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AiApplication = {
  id: string;
  classId: string;
  appKey: string;
  name: string;
  description: string;
  enabled: boolean;
  retrievalMode: RetrievalMode;
  retrievalLimit: number;
  evidenceRequired: boolean;
  promptTemplateVersionId: string | null;
};

export type ApplicationExecutionContext = {
  application: AiApplication;
  prompt: PromptTemplateVersion | null;
  skills: BoundSkill[];
  tools: BoundTool[];
};

export type ExecutionStepType =
  | "prompt"
  | "retrieval"
  | "provider_request"
  | "provider_response"
  | "skill_action"
  | "mcp_call"
  | "mcp_result"
  | "final_answer"
  | "error";
