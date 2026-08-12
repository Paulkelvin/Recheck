export function normalizeNigerianPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return null;
}
