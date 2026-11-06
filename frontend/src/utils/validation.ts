/** Mirrors the backend password policy: ≥10 characters with letters and digits. */
export function passwordChecks(pw: string) {
  return {
    length: pw.length >= 10,
    letters: /[A-Za-z؀-ۿ]/.test(pw),
    digits: /\d/.test(pw),
  };
}

export function passwordValid(pw: string): boolean {
  const c = passwordChecks(pw);
  return c.length && c.letters && c.digits;
}

export function inRange(v: number | null, min: number, max: number): boolean {
  return v !== null && v >= min && v <= max;
}
