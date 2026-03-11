const SECRET_PATTERNS: RegExp[] = [
  /NPiF\s+\w+\s+\w+\s+\w+\s+\w+\s+\w+/g,
  /sk-ant-[\w-]+/g,
  /Basic\s+[A-Za-z0-9+/=]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
  /ANTHROPIC_API_KEY=\S+/g,
  /WP_APP_PASSWORD=\S+/g,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
