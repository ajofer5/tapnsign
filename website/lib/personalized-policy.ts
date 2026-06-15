export const PERSONALIZED_REQUEST_MIN_CENTS = 2000;

const DISALLOWED_PATTERNS: RegExp[] = [
  /\b(fuck|shit|bitch|cunt|dick|pussy|cock|asshole)\b/i,
  /\b(sex|sexy|porn|nude|naked|boobs?|tits?|penis|vagina|cum)\b/i,
  /\b(kill|murder|rape|molest|suicide)\b/i,
  /\b(nazi|hitler|kkk)\b/i,
  /\b(fag|faggot|nigger|retard|tranny)\b/i,
];

export function personalizedTextIsAllowed(fields: Array<string | null | undefined>) {
  return fields.every((value) => {
    if (!value?.trim()) return true;
    return DISALLOWED_PATTERNS.every((pattern) => !pattern.test(value));
  });
}
