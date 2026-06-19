export type MappingRule = {
  id: string
  matchText: string
  displayLabel: string
  enabled: boolean
  isDefault: boolean
}

export const DEFAULT_MAPPING_RULES: MappingRule[] = [
  {
    id: "default-github",
    matchText: "github",
    displayLabel: "GitHub",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-github-repositories",
    matchText: "your repositories",
    displayLabel: "GitHub",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-chatgpt",
    matchText: "chatgpt",
    displayLabel: "ChatGPT",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-claude",
    matchText: "claude",
    displayLabel: "Claude",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-youtube",
    matchText: "youtube",
    displayLabel: "YouTube",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-whatsapp",
    matchText: "whatsapp",
    displayLabel: "WhatsApp",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-leetcode",
    matchText: "leetcode",
    displayLabel: "LeetCode",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-vercel",
    matchText: "vercel",
    displayLabel: "Vercel",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-x",
    matchText: "x.com",
    displayLabel: "X",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-personal-running",
    matchText: "running out of excuses",
    displayLabel: "Personal Websites",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-personal-name",
    matchText: "russel daniel paul",
    displayLabel: "Personal Websites",
    enabled: true,
    isDefault: true,
  },
  {
    id: "default-personal-blogs",
    matchText: "home | blogs",
    displayLabel: "Personal Websites",
    enabled: true,
    isDefault: true,
  },
]

export type MappingRuleErrors = Record<
  string,
  Partial<Record<"matchText" | "displayLabel", string>>
>

function normalizedMatchText(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function prioritizeMappingRules(rules: MappingRule[]) {
  return [
    ...rules.filter((rule) => !rule.isDefault),
    ...rules.filter((rule) => rule.isDefault),
  ]
}

export function validateMappingRules(rules: MappingRule[]): MappingRuleErrors {
  const errors: MappingRuleErrors = {}
  const seen = new Set<string>()

  for (const rule of rules) {
    const matchText = normalizedMatchText(rule.matchText)
    const ruleErrors: MappingRuleErrors[string] = {}

    if (!matchText) {
      ruleErrors.matchText = "Match text is required."
    } else if (seen.has(matchText)) {
      ruleErrors.matchText = "Match text must be unique."
    } else {
      seen.add(matchText)
    }

    if (!rule.displayLabel.trim()) {
      ruleErrors.displayLabel = "Display label is required."
    }

    if (Object.keys(ruleErrors).length > 0) {
      errors[rule.id] = ruleErrors
    }
  }

  return errors
}

export function cloneDefaultMappingRules() {
  return DEFAULT_MAPPING_RULES.map((rule) => ({ ...rule }))
}
