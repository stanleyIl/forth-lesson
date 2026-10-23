import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import { loadConfig } from "../config.js";
import { hashPassword } from "../security/passwords.js";
import type { Database, Role } from "./repositories.js";

export type SeedAccount = {
  accountIdentifier: string;
  password: string;
  role: Role;
  classId: string;
  className: string;
};

export async function seedAccounts(
  database: Database,
  accounts: SeedAccount[],
): Promise<void> {
  for (const account of accounts) {
    await database.query(
      `INSERT INTO classes (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [account.classId, account.className],
    );
    const passwordHash = await hashPassword(account.password);
    await database.query(
      `INSERT INTO users
       (id, account_identifier, password_hash, role, class_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_identifier) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           class_id = EXCLUDED.class_id`,
      [
        randomUUID(),
        account.accountIdentifier,
        passwordHash,
        account.role,
        account.classId,
      ],
    );
  }
}

export async function seedCourseData(
  database: Database,
  storageRoot: string,
  options: { mcpEndpoint?: string } = {},
): Promise<void> {
  const definitions = [
    {
      id: "seed-material-class-a",
      entryId: "seed-entry-class-a",
      account: "teacher-a",
      classId: "class-a",
      filename: "class-a-introduction.md",
      storageKey: "seed-class-a.md",
      content: "# Class A introduction\n\nClass A private teaching material.",
    },
    {
      id: "seed-material-class-b",
      entryId: "seed-entry-class-b",
      account: "teacher-b",
      classId: "class-b",
      filename: "class-b-introduction.md",
      storageKey: "seed-class-b.md",
      content: "# Class B introduction\n\nClass B private teaching material.",
    },
    {
      id: "seed-material-class-a-science",
      entryId: "seed-entry-class-a-science",
      account: "teacher-a",
      classId: "class-a",
      filename: "A班-小学科学课程资料.md",
      storageKey: "seed-class-a-science.md",
      content: "# 小学科学课程资料\n\n磁铁能吸引铁钉，不能吸引木块。条形磁铁两端吸力最强，中间较弱。同名磁极互相推开，异名磁极互相靠近。",
    },
  ] as const;

  await mkdir(storageRoot, { recursive: true });
  for (const definition of definitions) {
    const user = await database.query(
      "SELECT id FROM users WHERE account_identifier = $1",
      [definition.account],
    );
    if (!user.rows[0]) throw new Error(`Missing seeded account: ${definition.account}`);
    try {
      await writeFile(path.join(storageRoot, definition.storageKey), definition.content, {
        flag: "wx",
        mode: 0o644,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await chmod(path.join(storageRoot, definition.storageKey), 0o644);
    await database.query(
      `INSERT INTO materials
        (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, 'md', $6)
       ON CONFLICT (id) DO NOTHING`,
      [definition.id, user.rows[0].id, definition.classId, definition.filename, definition.storageKey, Buffer.byteLength(definition.content)],
    );
    await database.query(
      `INSERT INTO knowledge_entries
        (id, material_id, class_id, content, search_document, sequence_number)
       VALUES ($1, $2, $3, $4, $4, 0)
       ON CONFLICT (id) DO NOTHING`,
      [definition.entryId, definition.id, definition.classId, definition.content],
    );
  }
  for (const classId of ["class-a", "class-b"]) {
    await database.query(
      `INSERT INTO assistant_configs (class_id, system_prompt, guided_solving_enabled)
       VALUES ($1, $2, TRUE) ON CONFLICT (class_id) DO NOTHING`,
      [classId, "你是本班课程解题助手。仅依据提供的本班资料回答，并标注引用。"],
    );
    const teacher = (await database.query(
      `SELECT id FROM users WHERE class_id=$1 AND role='teacher' ORDER BY account_identifier LIMIT 1`,
      [classId],
    )).rows[0];
    const assistantConfig = (await database.query(
      `SELECT system_prompt,guided_solving_enabled FROM assistant_configs WHERE class_id=$1`,
      [classId],
    )).rows[0];
    const suffix = classId === "class-a" ? "a" : "b";
    const knowledgeTemplateId = `seed-template-knowledge-${suffix}`;
    const knowledgeVersionId = `seed-template-version-knowledge-${suffix}`;
    const formulaTemplateId = `seed-template-formula-${suffix}`;
    const formulaVersionId = `seed-template-version-formula-${suffix}`;
    await database.query(
      `INSERT INTO prompt_templates(id,class_id,name,description,created_by_user_id)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
      [knowledgeTemplateId, classId, "本班知识问答模板", "只依据本班检索证据回答", teacher.id],
    );
    await database.query(
      `INSERT INTO prompt_template_versions
        (id,template_id,class_id,version,body,variables_json,created_by_user_id)
       VALUES($1,$2,$3,1,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
      [
        knowledgeVersionId,
        knowledgeTemplateId,
        classId,
        `${assistantConfig.system_prompt}\n你是{{application_name}}，当前用户角色是{{user_role}}。只能依据以下本班资料回答并使用 [1] 引用。\n{{knowledge_evidence}}\n{{skill_instructions}}`,
        JSON.stringify(["application_name", "user_role", "knowledge_evidence", "skill_instructions"]),
        teacher.id,
      ],
    );
    await database.query(
      `UPDATE prompt_template_versions SET body=$2,variables_json=$3
       WHERE id=$1 AND body=$4`,
      [
        knowledgeVersionId,
        `${assistantConfig.system_prompt}\n你是{{application_name}}，当前用户角色是{{user_role}}。只能依据以下本班资料回答并使用 [1] 引用。\n{{knowledge_evidence}}\n{{skill_instructions}}`,
        JSON.stringify(["application_name", "user_role", "knowledge_evidence", "skill_instructions"]),
        "你是{{application_name}}，当前用户角色是{{user_role}}。只能依据以下本班资料回答并使用 [1] 引用。\n{{knowledge_evidence}}\n{{skill_instructions}}",
      ],
    );
    await database.query(
      `INSERT INTO prompt_templates(id,class_id,name,description,created_by_user_id)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
      [formulaTemplateId, classId, "公式辅导模板", "使用安全工具解释计算步骤", teacher.id],
    );
    await database.query(
      `INSERT INTO prompt_template_versions
        (id,template_id,class_id,version,body,variables_json,created_by_user_id)
       VALUES($1,$2,$3,1,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
      [
        formulaVersionId,
        formulaTemplateId,
        classId,
        "你是{{application_name}}，当前用户角色是{{user_role}}。请分析问题并在需要时调用已提供的计算或课程表工具。\n问题：{{question}}\n{{skill_instructions}}",
        JSON.stringify(["application_name", "user_role", "question", "skill_instructions"]),
        teacher.id,
      ],
    );

    const guidedSkillId = `seed-skill-guided-${suffix}`;
    const guidedVersionId = `seed-skill-version-guided-${suffix}`;
    const keyPointsSkillId = `seed-skill-key-points-${suffix}`;
    const keyPointsVersionId = `seed-skill-version-key-points-${suffix}`;
    await database.query(
      `INSERT INTO skills(id,class_id,skill_key,name,description,origin,created_by_user_id)
       VALUES($1,$2,'guided-solving','解题引导','给出思路和引用提示','builtin',$3)
       ON CONFLICT(id) DO NOTHING`,
      [guidedSkillId, classId, teacher.id],
    );
    await database.query(
      `INSERT INTO skill_versions
        (id,skill_id,class_id,semantic_version,skill_type,instruction_body,content_hash)
       VALUES($1,$2,$3,'1.0.0','instruction',$4,$5) ON CONFLICT(id) DO NOTHING`,
      [guidedVersionId, guidedSkillId, classId, "给出解题思路和引用提示，不直接伪造资料中没有的结论。", `seed-guided-${suffix}`],
    );
    await database.query(
      `INSERT INTO skills(id,class_id,skill_key,name,description,origin,created_by_user_id)
       VALUES($1,$2,'extract-key-points','要点提取','提取工具结果中的关键步骤','builtin',$3)
       ON CONFLICT(id) DO NOTHING`,
      [keyPointsSkillId, classId, teacher.id],
    );
    await database.query(
      `INSERT INTO skill_versions
        (id,skill_id,class_id,semantic_version,skill_type,action_name,options_json,content_hash)
       VALUES($1,$2,$3,'1.0.0','server_action','extract-key-points',$4,$5)
       ON CONFLICT(id) DO NOTHING`,
      [keyPointsVersionId, keyPointsSkillId, classId, JSON.stringify({ maximum: 3 }), `seed-key-points-${suffix}`],
    );

    const knowledgeAppId = `seed-app-knowledge-${suffix}`;
    const formulaAppId = `seed-app-formula-${suffix}`;
    await database.query(
      `INSERT INTO ai_applications
        (id,class_id,app_key,name,description,prompt_template_version_id,retrieval_mode,retrieval_limit,evidence_required,created_by_user_id)
       VALUES($1,$2,'class-knowledge-assistant',$3,$4,$5,'hybrid',4,TRUE,$6)
       ON CONFLICT(id) DO NOTHING`,
      [knowledgeAppId, classId, `${classId === "class-a" ? "A" : "B"}班知识助手`, "基于本班材料检索并标注来源", knowledgeVersionId, teacher.id],
    );
    await database.query(
      `INSERT INTO ai_applications
        (id,class_id,app_key,name,description,prompt_template_version_id,retrieval_mode,retrieval_limit,evidence_required,created_by_user_id)
       VALUES($1,$2,'formula-tutor',$3,$4,$5,'none',4,FALSE,$6)
       ON CONFLICT(id) DO NOTHING`,
      [formulaAppId, classId, `${classId === "class-a" ? "A" : "B"}班公式辅导`, "使用计算与课程表工具进行辅导", formulaVersionId, teacher.id],
    );
    if (assistantConfig.guided_solving_enabled) {
      await database.query(
        `INSERT INTO ai_application_skill_bindings(application_id,skill_version_id,class_id,position)
         VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING`,
        [knowledgeAppId, guidedVersionId, classId],
      );
    } else {
      await database.query(
        `DELETE FROM ai_application_skill_bindings
         WHERE application_id=$1 AND skill_version_id=$2 AND class_id=$3`,
        [knowledgeAppId, guidedVersionId, classId],
      );
    }
    await database.query(
      `INSERT INTO ai_application_skill_bindings(application_id,skill_version_id,class_id,position)
       VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING`,
      [formulaAppId, keyPointsVersionId, classId],
    );
    const mcpServerId = `seed-mcp-server-${suffix}`;
    await database.query(
      `INSERT INTO mcp_servers(id,class_id,server_key,display_name,endpoint_url)
       VALUES($1,$2,'campus-tools','CampusClaw 本地工具',$3)
       ON CONFLICT(id) DO UPDATE SET endpoint_url=EXCLUDED.endpoint_url,updated_at=CURRENT_TIMESTAMP`,
      [mcpServerId, classId, options.mcpEndpoint ?? "http://mcp-server:3100/mcp"],
    );
    await database.query(
      `UPDATE conversations SET ai_application_id=$1 WHERE class_id=$2 AND ai_application_id IS NULL`,
      [knowledgeAppId, classId],
    );
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD;
  const studentPassword = process.env.SEED_STUDENT_PASSWORD;
  if (!teacherPassword || !studentPassword) {
    throw new Error(
      "SEED_TEACHER_PASSWORD and SEED_STUDENT_PASSWORD are required",
    );
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    await seedAccounts(pool, [
      {
        accountIdentifier: "teacher-a",
        password: teacherPassword,
        role: "teacher",
        classId: "class-a",
        className: "Class A",
      },
      {
        accountIdentifier: "student-a",
        password: studentPassword,
        role: "student",
        classId: "class-a",
        className: "Class A",
      },
      {
        accountIdentifier: "teacher-b",
        password: teacherPassword,
        role: "teacher",
        classId: "class-b",
        className: "Class B",
      },
      {
        accountIdentifier: "student-b",
        password: studentPassword,
        role: "student",
        classId: "class-b",
        className: "Class B",
      },
    ]);
    await seedCourseData(pool, config.materialStorageRoot, { mcpEndpoint: config.mcpServerUrl });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
