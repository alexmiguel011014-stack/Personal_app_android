export function headerVersion(rules: string): number | null;

export function checkRulesVersion(input: { rules: string; archives: Record<string, string> }): string[];
