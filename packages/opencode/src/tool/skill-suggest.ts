import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { Question } from "../question"
import { PermissionNext } from "@/permission/next"
import { Agent } from "@/agent/agent"

const parameters = z.object({
  skills: z
    .array(
      z.object({
        name: z.string().describe("The name of the skill"),
        description: z.string().describe("The description of the skill"),
        reason: z.string().describe("Why this skill is recommended for the current task"),
      }),
    )
    .describe("List of recommended skills with reasons"),
})

export const SkillSuggestTool = Tool.define("skill-suggest", async () => {
  return {
    description:
      "Recommend relevant skills to the user and let them choose which ones to load. Use this tool before calling the 'skill' tool to get user confirmation.",
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const allSkills = await Skill.all()

      const agent = await Agent.get(ctx.agent)
      const accessibleSkills = allSkills.filter((skill) => {
        if (!agent) return true
        const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
        return rule.action !== "deny"
      })

      const validSuggestions = params.skills.filter((s) =>
        accessibleSkills.some((available) => available.name === s.name),
      )

      if (validSuggestions.length === 0) {
        return {
          title: "No valid skills suggested",
          output: "None of the suggested skills are available or accessible with current permissions.",
          metadata: {
            suggested: params.skills.map((s) => s.name),
            loaded: [],
          },
        }
      }

      const questionText =
        validSuggestions.length === 1
          ? `I recommend using the '${validSuggestions[0].name}' skill: ${validSuggestions[0].reason}. Would you like me to load it?`
          : `I recommend the following skills for this task:\n\n${validSuggestions.map((s, i) => `${i + 1}. **${s.name}**: ${s.description}\n   Reason: ${s.reason}`).join("\n\n")}\n\nWhich skills would you like me to load? (You can select multiple or none)`

      const answers = await Question.ask({
        sessionID: ctx.sessionID,
        questions: [
          {
            question: questionText,
            header: "Skill Selection",
            options: validSuggestions.map((s) => ({
              label: s.name,
              description: s.reason,
            })),
            multiple: true,
          },
        ],
        tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
      })

      const selectedSkills = answers[0] ?? []
      const loadedSkills: string[] = []

      for (const skillName of selectedSkills) {
        if (validSuggestions.some((s) => s.name === skillName)) {
          loadedSkills.push(skillName)
        }
      }

      return {
        title: `Suggested ${validSuggestions.length} skill${validSuggestions.length > 1 ? "s" : ""}, user selected ${loadedSkills.length}`,
        output:
          loadedSkills.length > 0
            ? `User selected skills to load: ${loadedSkills.join(", ")}. Call the 'skill' tool for each selected skill to load its content.`
            : "User declined all skill suggestions. Proceed without loading additional skills.",
        metadata: {
          suggested: validSuggestions.map((s) => s.name),
          loaded: loadedSkills,
          declined: validSuggestions.filter((s) => !loadedSkills.includes(s.name)).map((s) => s.name),
        } as any,
      }
    },
  }
})
