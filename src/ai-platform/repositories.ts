import { createHash, randomUUID } from "node:crypto";

import type { Database, SessionIdentity } from "../db/repositories.js";
import type {
  AiApplication,
  ApplicationExecutionContext,
  BoundSkill,
  BoundTool,
  ExecutionStepType,
  PromptTemplateVersion,
  RetrievalMode,
} from "./types.js";

const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return typeof value === "string" ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};

export class PromptTemplateRepository {
  constructor(private readonly database: Database) {}

  async list(classId: string) {
    return (await this.database.query(
      `SELECT t.id,t.class_id,t.name,t.description,t.enabled,t.created_at,t.updated_at,
        coalesce(max(v.version),0) AS latest_version
       FROM prompt_templates t LEFT JOIN prompt_template_versions v ON v.template_id=t.id AND v.class_id=t.class_id
       WHERE t.class_id=$1
       GROUP BY t.id,t.class_id,t.name,t.description,t.enabled,t.created_at,t.updated_at
       ORDER BY t.name,t.id`,
      [classId],
    )).rows;
  }

  async getVersion(versionId: string, classId: string): Promise<PromptTemplateVersion | null> {
    const row = (await this.database.query(
      `SELECT v.id,v.template_id,v.class_id,v.version,v.body,v.variables_json,
        t.name,t.description,t.enabled
       FROM prompt_template_versions v JOIN prompt_templates t
        ON t.id=v.template_id AND t.class_id=v.class_id
       WHERE v.id=$1 AND v.class_id=$2`,
      [versionId, classId],
    )).rows[0];
    return row ? {
      id: row.id,
      templateId: row.template_id,
      classId: row.class_id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      version: Number(row.version),
      body: row.body,
      variables: parseJson<string[]>(row.variables_json, []),
    } : null;
  }

  async listVersions(classId: string) {
    return (await this.database.query(
      `SELECT v.id,v.template_id,v.version,v.body,v.variables_json,v.created_at,t.name,t.enabled
       FROM prompt_template_versions v JOIN prompt_templates t ON t.id=v.template_id AND t.class_id=v.class_id
       WHERE v.class_id=$1 ORDER BY t.name,v.version DESC,v.id`,
      [classId],
    )).rows.map((row) => ({ ...row, variables: parseJson<string[]>(row.variables_json, []) }));
  }

  async create(identity: SessionIdentity, input: { name: string; description: string; body: string; variables: string[] }) {
    const templateId = randomUUID();
    const versionId = randomUUID();
    await this.database.query(
      `INSERT INTO prompt_templates(id,class_id,name,description,created_by_user_id)
       VALUES($1,$2,$3,$4,$5)`,
      [templateId, identity.classId, input.name, input.description, identity.userId],
    );
    await this.database.query(
      `INSERT INTO prompt_template_versions(id,template_id,class_id,version,body,variables_json,created_by_user_id)
       VALUES($1,$2,$3,1,$4,$5,$6)`,
      [versionId, templateId, identity.classId, input.body, JSON.stringify(input.variables), identity.userId],
    );
    return this.getVersion(versionId, identity.classId);
  }

  async addVersion(identity: SessionIdentity, templateId: string, input: { body: string; variables: string[]; description?: string }) {
    const template = (await this.database.query(
      `SELECT id FROM prompt_templates WHERE id=$1 AND class_id=$2`,
      [templateId, identity.classId],
    )).rows[0];
    if (!template) return null;
    const next = Number((await this.database.query(
      `SELECT coalesce(max(version),0)+1 AS version FROM prompt_template_versions WHERE template_id=$1`,
      [templateId],
    )).rows[0].version);
    const versionId = randomUUID();
    await this.database.query(
      `INSERT INTO prompt_template_versions(id,template_id,class_id,version,body,variables_json,created_by_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [versionId, templateId, identity.classId, next, input.body, JSON.stringify(input.variables), identity.userId],
    );
    if (input.description !== undefined) {
      await this.database.query(
        `UPDATE prompt_templates SET description=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND class_id=$2`,
        [templateId, identity.classId, input.description],
      );
    }
    return this.getVersion(versionId, identity.classId);
  }

  async setEnabled(templateId: string, classId: string, enabled: boolean) {
    return (await this.database.query(
      `UPDATE prompt_templates SET enabled=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND class_id=$2 RETURNING id`,
      [templateId, classId, enabled],
    )).rows[0] ?? null;
  }
}

export class SkillRepository {
  constructor(private readonly database: Database) {}

  async list(classId: string) {
    return (await this.database.query(
      `SELECT s.id,s.skill_key,s.name,s.description,s.origin,s.enabled,
        v.id AS version_id,v.semantic_version,v.skill_type,v.action_name,v.content_hash
       FROM skills s JOIN skill_versions v ON v.skill_id=s.id AND v.class_id=s.class_id
       WHERE s.class_id=$1 ORDER BY s.name,s.id,v.created_at DESC,v.id`,
      [classId],
    )).rows;
  }

  async createVersion(identity: SessionIdentity, input: {
    skillKey: string; name: string; description: string; origin: "builtin" | "uploaded";
    semanticVersion: string; type: "instruction" | "server_action"; actionName?: string;
    instructionBody: string; options: Record<string, unknown>; contentHash: string;
  }) {
    let skill = (await this.database.query(
      `SELECT id FROM skills WHERE class_id=$1 AND skill_key=$2`,
      [identity.classId, input.skillKey],
    )).rows[0];
    if (!skill) {
      skill = { id: randomUUID() };
      await this.database.query(
        `INSERT INTO skills(id,class_id,skill_key,name,description,origin,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [skill.id, identity.classId, input.skillKey, input.name, input.description, input.origin, identity.userId],
      );
    }
    const versionId = randomUUID();
    await this.database.query(
      `INSERT INTO skill_versions
        (id,skill_id,class_id,semantic_version,skill_type,action_name,instruction_body,options_json,content_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [versionId, skill.id, identity.classId, input.semanticVersion, input.type, input.actionName ?? null,
        input.instructionBody, JSON.stringify(input.options), input.contentHash],
    );
    return { skillId: skill.id, versionId };
  }

  async setEnabled(skillId: string, classId: string, enabled: boolean) {
    return (await this.database.query(
      `UPDATE skills SET enabled=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND class_id=$2 RETURNING id`,
      [skillId, classId, enabled],
    )).rows[0] ?? null;
  }

  async validateVersionIds(classId: string, versionIds: string[]) {
    for (const versionId of versionIds) {
      const found = (await this.database.query(
        `SELECT id FROM skill_versions WHERE id=$1 AND class_id=$2`,
        [versionId, classId],
      )).rows[0];
      if (!found) throw new Error("Invalid skill binding");
    }
  }

  async replaceBindings(applicationId: string, classId: string, versionIds: string[]) {
    await this.validateVersionIds(classId, versionIds);
    await this.database.query(
      `DELETE FROM ai_application_skill_bindings WHERE application_id=$1 AND class_id=$2`,
      [applicationId, classId],
    );
    for (let position = 0; position < versionIds.length; position += 1) {
      await this.database.query(
        `INSERT INTO ai_application_skill_bindings(application_id,skill_version_id,class_id,position)
         VALUES($1,$2,$3,$4)`,
        [applicationId, versionIds[position], classId, position],
      );
    }
  }
}

export class AiApplicationRepository {
  constructor(private readonly database: Database) {}

  private map(row: Record<string, unknown>): AiApplication {
    return {
      id: String(row.id),
      classId: String(row.class_id),
      appKey: String(row.app_key),
      name: String(row.name),
      description: String(row.description ?? ""),
      enabled: Boolean(row.enabled),
      retrievalMode: row.retrieval_mode as RetrievalMode,
      retrievalLimit: Number(row.retrieval_limit),
      evidenceRequired: Boolean(row.evidence_required),
      promptTemplateVersionId: row.prompt_template_version_id ? String(row.prompt_template_version_id) : null,
    };
  }

  async list(classId: string, includeDisabled = false): Promise<AiApplication[]> {
    const result = await this.database.query(
      `SELECT * FROM ai_applications WHERE class_id=$1 AND ($2::boolean OR enabled=TRUE) ORDER BY name,id`,
      [classId, includeDisabled],
    );
    return result.rows.map((row) => this.map(row));
  }

  async find(id: string, classId: string, requireEnabled = true): Promise<AiApplication | null> {
    const row = (await this.database.query(
      `SELECT * FROM ai_applications WHERE id=$1 AND class_id=$2 AND ($3::boolean=FALSE OR enabled=TRUE)`,
      [id, classId, requireEnabled],
    )).rows[0];
    return row ? this.map(row) : null;
  }

  async findByKey(classId: string, appKey: string): Promise<AiApplication | null> {
    const row = (await this.database.query(
      `SELECT * FROM ai_applications WHERE class_id=$1 AND app_key=$2`,
      [classId, appKey],
    )).rows[0];
    return row ? this.map(row) : null;
  }

  async create(identity: SessionIdentity, input: {
    appKey: string; name: string; description: string; promptTemplateVersionId: string | null;
    retrievalMode: RetrievalMode; retrievalLimit: number; evidenceRequired: boolean; enabled?: boolean;
  }) {
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO ai_applications
        (id,class_id,app_key,name,description,prompt_template_version_id,retrieval_mode,retrieval_limit,evidence_required,enabled,created_by_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, identity.classId, input.appKey, input.name, input.description, input.promptTemplateVersionId,
        input.retrievalMode, input.retrievalLimit, input.evidenceRequired, input.enabled ?? true, identity.userId],
    );
    return this.find(id, identity.classId, false);
  }

  async update(identity: SessionIdentity, id: string, input: {
    name: string; description: string; promptTemplateVersionId: string | null;
    retrievalMode: RetrievalMode; retrievalLimit: number; evidenceRequired: boolean; enabled: boolean;
  }) {
    const row = (await this.database.query(
      `UPDATE ai_applications SET name=$3,description=$4,prompt_template_version_id=$5,
        retrieval_mode=$6,retrieval_limit=$7,evidence_required=$8,enabled=$9,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND class_id=$2 RETURNING *`,
      [id, identity.classId, input.name, input.description, input.promptTemplateVersionId,
        input.retrievalMode, input.retrievalLimit, input.evidenceRequired, input.enabled],
    )).rows[0];
    return row ? this.map(row) : null;
  }

  async context(id: string, classId: string): Promise<ApplicationExecutionContext | null> {
    const application = await this.find(id, classId);
    if (!application) return null;
    const promptRow = application.promptTemplateVersionId
      ? (await this.database.query(
          `SELECT v.id,v.template_id,v.class_id,v.version,v.body,v.variables_json,t.name,t.description,t.enabled
           FROM prompt_template_versions v JOIN prompt_templates t ON t.id=v.template_id AND t.class_id=v.class_id
           WHERE v.id=$1 AND v.class_id=$2 AND t.enabled=TRUE`,
          [application.promptTemplateVersionId, classId],
        )).rows[0]
      : null;
    const skills = (await this.database.query(
      `SELECT s.id AS skill_id,v.id AS version_id,s.skill_key,s.name,v.semantic_version,
        v.skill_type,v.action_name,v.instruction_body,v.options_json,b.position
       FROM ai_application_skill_bindings b
       JOIN skill_versions v ON v.id=b.skill_version_id AND v.class_id=b.class_id
       JOIN skills s ON s.id=v.skill_id AND s.class_id=v.class_id
       WHERE b.application_id=$1 AND b.class_id=$2 AND b.enabled=TRUE AND s.enabled=TRUE
       ORDER BY b.position,v.id`,
      [id, classId],
    )).rows.map((row): BoundSkill => ({
      skillId: row.skill_id,
      versionId: row.version_id,
      skillKey: row.skill_key,
      name: row.name,
      semanticVersion: row.semantic_version,
      type: row.skill_type,
      actionName: row.action_name ?? undefined,
      instructionBody: row.instruction_body,
      options: parseJson<Record<string, unknown>>(row.options_json, {}),
      position: Number(row.position),
    }));
    const tools = (await this.database.query(
      `SELECT t.id AS tool_id,t.server_id,s.server_key,s.endpoint_url,t.tool_name,t.normalized_name,
        t.description,t.input_schema_json
       FROM ai_application_tool_bindings b
       JOIN mcp_tools t ON t.id=b.tool_id AND t.class_id=b.class_id
       JOIN mcp_servers s ON s.id=t.server_id AND s.class_id=t.class_id
       WHERE b.application_id=$1 AND b.class_id=$2 AND b.enabled=TRUE AND t.enabled=TRUE AND s.enabled=TRUE
       ORDER BY t.normalized_name`,
      [id, classId],
    )).rows.map((row): BoundTool => ({
      toolId: row.tool_id,
      serverId: row.server_id,
      serverKey: row.server_key,
      endpointUrl: row.endpoint_url,
      toolName: row.tool_name,
      normalizedName: row.normalized_name,
      description: row.description,
      inputSchema: parseJson<Record<string, unknown>>(row.input_schema_json, {}),
    }));
    const prompt = promptRow ? {
      id: promptRow.id,
      templateId: promptRow.template_id,
      classId: promptRow.class_id,
      name: promptRow.name,
      description: promptRow.description,
      enabled: promptRow.enabled,
      version: Number(promptRow.version),
      body: promptRow.body,
      variables: parseJson<string[]>(promptRow.variables_json, []),
    } : null;
    return { application, prompt, skills, tools };
  }
}

export class McpRepository {
  constructor(private readonly database: Database) {}

  async ensureServer(classId: string, serverKey: string, displayName: string, endpointUrl: string) {
    const existing = (await this.database.query(
      `SELECT * FROM mcp_servers WHERE class_id=$1 AND server_key=$2`,
      [classId, serverKey],
    )).rows[0];
    if (existing) {
      await this.database.query(
        `UPDATE mcp_servers SET display_name=$3,endpoint_url=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND class_id=$2`,
        [existing.id, classId, displayName, endpointUrl],
      );
      return existing.id as string;
    }
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO mcp_servers(id,class_id,server_key,display_name,endpoint_url)
       VALUES($1,$2,$3,$4,$5)`,
      [id, classId, serverKey, displayName, endpointUrl],
    );
    return id;
  }

  async markFailure(serverId: string, classId: string, error: string) {
    await this.database.query(
      `UPDATE mcp_servers SET discovery_status='failed',discovery_error=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND class_id=$2`,
      [serverId, classId, error.slice(0, 500)],
    );
  }

  async replaceTools(serverId: string, classId: string, serverKey: string, tools: Array<{
    name: string; description: string; inputSchema: Record<string, unknown>;
  }>) {
    const existingRows = (await this.database.query(
      `SELECT id,tool_name FROM mcp_tools WHERE server_id=$1 AND class_id=$2`,
      [serverId, classId],
    )).rows;
    const existing = new Map(existingRows.map((row) => [String(row.tool_name), String(row.id)]));
    await this.database.query(
      `UPDATE mcp_tools SET enabled=FALSE WHERE server_id=$1 AND class_id=$2`,
      [serverId, classId],
    );
    for (const tool of tools) {
      const normalizedName = `mcp__${serverKey.replace(/-/g, "_")}__${tool.name.replace(/[^a-zA-Z0-9_]/g, "_")}`.toLowerCase();
      const schema = JSON.stringify(tool.inputSchema);
      await this.database.query(
        `INSERT INTO mcp_tools
          (id,server_id,class_id,tool_name,normalized_name,description,input_schema_json,schema_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(server_id,tool_name) DO UPDATE SET
          normalized_name=EXCLUDED.normalized_name,
          description=EXCLUDED.description,
          input_schema_json=EXCLUDED.input_schema_json,
          schema_hash=EXCLUDED.schema_hash,
          enabled=TRUE,
          discovered_at=CURRENT_TIMESTAMP`,
        [existing.get(tool.name) ?? randomUUID(), serverId, classId, tool.name, normalizedName, tool.description, schema,
          createHash("sha256").update(schema).digest("hex")],
      );
    }
    await this.database.query(
      `UPDATE mcp_servers SET discovery_status='ready',discovery_error=NULL,discovered_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND class_id=$2`,
      [serverId, classId],
    );
  }

  async listServers(classId: string) {
    return (await this.database.query(
      `SELECT id,server_key,display_name,enabled,discovery_status,discovery_error,discovered_at
       FROM mcp_servers WHERE class_id=$1 ORDER BY display_name,id`,
      [classId],
    )).rows;
  }

  async listTools(classId: string) {
    return (await this.database.query(
      `SELECT t.id,t.server_id,s.server_key,t.tool_name,t.normalized_name,t.description,t.input_schema_json,t.enabled
       FROM mcp_tools t JOIN mcp_servers s ON s.id=t.server_id AND s.class_id=t.class_id
       WHERE t.class_id=$1 ORDER BY s.server_key,t.tool_name`,
      [classId],
    )).rows.map((row) => ({
      id: row.id,
      server_id: row.server_id,
      server_key: row.server_key,
      tool_name: row.tool_name,
      normalized_name: row.normalized_name,
      description: row.description,
      enabled: row.enabled,
      inputSchema: parseJson(row.input_schema_json, {}),
    }));
  }

  async validateToolIds(classId: string, toolIds: string[]) {
    for (const toolId of toolIds) {
      const found = (await this.database.query(
        `SELECT id FROM mcp_tools WHERE id=$1 AND class_id=$2 AND enabled=TRUE`,
        [toolId, classId],
      )).rows[0];
      if (!found) throw new Error("Invalid MCP tool binding");
    }
  }

  async replaceBindings(applicationId: string, classId: string, toolIds: string[]) {
    await this.validateToolIds(classId, toolIds);
    await this.database.query(
      `DELETE FROM ai_application_tool_bindings WHERE application_id=$1 AND class_id=$2`,
      [applicationId, classId],
    );
    for (const toolId of toolIds) {
      await this.database.query(
        `INSERT INTO ai_application_tool_bindings(application_id,tool_id,class_id) VALUES($1,$2,$3)`,
        [applicationId, toolId, classId],
      );
    }
  }
}

export class ExecutionRepository {
  constructor(private readonly database: Database, private readonly previewCharacters: number) {}

  async create(input: {
    identity: SessionIdentity; applicationId: string; conversationId?: string; messageId?: string;
    model: string; promptTemplateVersionId?: string | null; retrievalMode: string; generationParams: unknown;
  }) {
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO ai_executions
        (id,user_id,class_id,application_id,conversation_id,message_id,status,model_identity,prompt_template_version_id,retrieval_mode,generation_params_json)
       VALUES($1,$2,$3,$4,$5,$6,'running',$7,$8,$9,$10)`,
      [id, input.identity.userId, input.identity.classId, input.applicationId, input.conversationId ?? null,
        input.messageId ?? null, input.model, input.promptTemplateVersionId ?? null, input.retrievalMode,
        JSON.stringify(input.generationParams)],
    );
    return id;
  }

  async addStep(executionId: string, classId: string, type: ExecutionStepType, summary: string, details: unknown, durationMs?: number) {
    const sequence = Number((await this.database.query(
      `SELECT coalesce(max(sequence_number),-1)+1 AS sequence FROM ai_execution_steps WHERE execution_id=$1`,
      [executionId],
    )).rows[0].sequence);
    await this.database.query(
      `INSERT INTO ai_execution_steps
        (id,execution_id,class_id,sequence_number,step_type,summary,details_json,duration_ms)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), executionId, classId, sequence, type, summary.slice(0, 500), JSON.stringify(details), durationMs ?? null],
    );
  }

  async finish(executionId: string, classId: string, status: "done" | "no_hit" | "error" | "cancelled", response?: string, errorCode?: string) {
    await this.database.query(
      `UPDATE ai_executions SET status=$3,final_response_preview=$4,error_code=$5,completed_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND class_id=$2`,
      [executionId, classId, status, response?.slice(0, this.previewCharacters) ?? null, errorCode ?? null],
    );
  }

  async list(classId: string, limit = 50) {
    return (await this.database.query(
      `SELECT e.id,e.status,e.model_identity,e.retrieval_mode,e.started_at,e.completed_at,
        e.final_response_preview,a.name AS application_name
       FROM ai_executions e JOIN ai_applications a ON a.id=e.application_id AND a.class_id=e.class_id
       WHERE e.class_id=$1 ORDER BY e.started_at DESC,e.id LIMIT $2`,
      [classId, limit],
    )).rows;
  }

  async detail(id: string, classId: string) {
    const execution = (await this.database.query(
      `SELECT e.*,a.name AS application_name FROM ai_executions e
       JOIN ai_applications a ON a.id=e.application_id AND a.class_id=e.class_id
       WHERE e.id=$1 AND e.class_id=$2`,
      [id, classId],
    )).rows[0];
    if (!execution) return null;
    const steps = (await this.database.query(
      `SELECT sequence_number,step_type,summary,details_json,duration_ms,created_at
       FROM ai_execution_steps WHERE execution_id=$1 AND class_id=$2 ORDER BY sequence_number`,
      [id, classId],
    )).rows.map((row) => ({
      sequence_number: row.sequence_number,
      step_type: row.step_type,
      summary: row.summary,
      duration_ms: row.duration_ms,
      created_at: row.created_at,
      details: parseJson(row.details_json, {}),
    }));
    const { generation_params_json: _rawGenerationParameters, ...safeExecution } = execution;
    return {
      ...safeExecution,
      generationParams: parseJson(execution.generation_params_json, {}),
      steps,
    };
  }

  async cleanup(classId: string, retentionDays: number, maximumCount: number) {
    await this.database.query(
      `DELETE FROM ai_executions WHERE class_id=$1 AND started_at < CURRENT_TIMESTAMP - ($2::text || ' days')::interval`,
      [classId, retentionDays],
    );
    await this.database.query(
      `DELETE FROM ai_executions WHERE id IN (
        SELECT id FROM ai_executions WHERE class_id=$1 ORDER BY started_at DESC,id OFFSET $2
      )`,
      [classId, maximumCount],
    );
  }
}
