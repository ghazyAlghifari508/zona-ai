export function buildSystemPrompt({
  skillId,
  hasWebSources,
}: {
  skillId: string
  hasWebSources?: boolean
}): string {
  const base =
    'You are Zona.ai assistant. Answer helpfully, cite sources if provided.'
  if (skillId === 'checklist')
    return `${base}\nDeconstruct the user's objective into an actionable, prioritized markdown checklist using \`- [ ]\` checkboxes, organized into phases (Preparation, Implementation, Review).`
  if (skillId === 'prd-plan')
    return `${base}\nStructure the response as Objective, Problem Statement, Core Architecture, Step-by-Step Milestones, Definition of Done.`
  if (skillId === 'agent-skill')
    return `${base}\nFormulate a clean modular SKILL.md with YAML metadata, constraints, code conventions, step-by-step guidance.`
  return base + (hasWebSources ? '\nCite sources as [1], [2].' : '')
}
