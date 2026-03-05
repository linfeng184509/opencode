import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { Ripgrep } from "../file/ripgrep"
import { iife } from "@/util/iife"
import { Question } from "../question"
import { PermissionNext } from "@/permission/next"
import { Agent } from "@/agent/agent"
import { Session } from "../session"

const parameters = z.object({
  skills: z
    .array(
      z.object({
        name: z.string().describe("The name of the skill"),
        reason: z.string().optional().describe("Why this skill is recommended (used when suggesting multiple skills)"),
      }),
    )
    .describe(
      "List of skills to load or suggest. Pass a single skill to load directly, or multiple skills to let user choose.",
    ),
})

type SkillMetadata = {
  suggested: string[]
  loaded: string[]
  declined?: string[]
  name?: string
  dir?: string
}

async function loadSkill(skillName: string, ctx: Tool.Context) {
  const skill = await Skill.get(skillName)

  if (!skill) {
    const available = await Skill.all().then((x) => x.map((s) => s.name).join(", "))
    throw new Error(`Skill "${skillName}" not found. Available skills: ${available || "none"}`)
  }

  await ctx.ask({
    permission: "skill",
    patterns: [skillName],
    always: [skillName],
    metadata: {},
  })

  const dir = path.dirname(skill.location)
  const base = pathToFileURL(dir).href

  const files = await iife(async () => {
    const arr: string[] = []
    for await (const file of Ripgrep.files({
      cwd: dir,
      follow: false,
      hidden: true,
      signal: ctx.abort,
    })) {
      if (file.includes("SKILL.md")) continue
      arr.push(path.resolve(dir, file))
    }
    return arr
  })

  await Session.addLoadedSkill({
    sessionID: ctx.sessionID,
    skillName: skill.name,
  })

  return {
    name: skill.name,
    content: [
      `<skill_content name="${skill.name}">`,
      `# Skill: ${skill.name}`,
      "",
      skill.content.trim(),
      "",
      `Base directory for this skill: ${base}`,
      "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
      "",
      "<skill_files>",
      files.map((file) => `<file>${file}</file>`).join("\n"),
      "</skill_files>",
      "</skill_content>",
    ].join("\n"),
    dir,
  }
}

export const SkillTool = Tool.define("skill", async () => {
  return {
    description:
      "Load skills by name. Pass a single skill to load directly, or multiple skills to let user choose which ones to load. Skills provide specialized capabilities and domain knowledge for specific tasks.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx): Promise<{
      title: string
      output: string
      metadata: SkillMetadata
    }> {
      const allSkills = await Skill.all()

      const agent = await Agent.get(ctx.agent)
      const accessibleSkills = allSkills.filter((skill) => {
        if (!agent) return true
        const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
        return rule.action !== "deny"
      })

      const validSkills = params.skills.filter((s) =>
        accessibleSkills.some((available) => available.name === s.name),
      )

      if (validSkills.length === 0) {
        const available = accessibleSkills.map((s) => s.name).join(", ")
        return {
          title: "No valid skills found",
          output: `None of the specified skills are available. Available skills: ${available || "none"}`,
          metadata: {
            suggested: params.skills.map((s) => s.name),
            loaded: [],
          },
        }
      }

      if (validSkills.length === 1) {
        const result = await loadSkill(validSkills[0].name, ctx)
        return {
          title: `Loaded skill: ${result.name}`,
          output: result.content,
          metadata: {
            suggested: [result.name],
            loaded: [result.name],
            name: result.name,
            dir: result.dir,
          },
        }
      }

      const questionText = `I recommend the following skills for this task:\n\n${validSkills
        .map((s, i) => `${i + 1}. **${s.name}**${s.reason ? `: ${s.reason}` : ""}`)
        .join("\n\n")}\n\nWhich skills would you like me to load? (You can select multiple or none)`

      const answers = await Question.ask({
        sessionID: ctx.sessionID,
        questions: [
          {
            question: questionText,
            header: "Skill Selection",
            options: validSkills.map((s) => ({
              label: s.name,
              description: s.reason ?? "",
            })),
            multiple: true,
          },
        ],
        tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
      })

      const selectedSkills = answers[0] ?? []
      const loadedSkills: string[] = []
      const outputs: string[] = []

      for (const skillName of selectedSkills) {
        if (validSkills.some((s) => s.name === skillName)) {
          try {
            const result = await loadSkill(skillName, ctx)
            loadedSkills.push(result.name)
            outputs.push(result.content)
          } catch (e) {
            outputs.push(`Failed to load skill "${skillName}": ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }

      return {
        title: `Loaded ${loadedSkills.length} skill${loadedSkills.length !== 1 ? "s" : ""}`,
        output:
          loadedSkills.length > 0
            ? outputs.join("\n\n---\n\n")
            : "User declined all skill suggestions. Proceed without loading additional skills.",
        metadata: {
          suggested: validSkills.map((s) => s.name),
          loaded: loadedSkills,
          declined: validSkills.filter((s) => !loadedSkills.includes(s.name)).map((s) => s.name),
        },
      }
    },
  }
})
