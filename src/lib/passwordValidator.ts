// Bilingual password validator with specific, actionable feedback.
// Returns either ok=true, or ok=false with a precise message that lists
// exactly what is missing so the user can fix it on the first try and
// avoid Supabase rate-limit penalties from repeated failed signups.

export type PasswordLocale = "es" | "en";

const MIN_LENGTH = 8;

/**
 * Validate a password client-side BEFORE calling supabase.auth.signUp.
 * Rules (aligned with Supabase default + common strength expectations):
 *  - At least 8 characters
 *  - At least one letter
 *  - At least one number
 *  - Not the same as email local-part
 */
export function validatePassword(
  password: string,
  locale: PasswordLocale,
  email?: string,
): { ok: true } | { ok: false; message: string } {
  const es = locale === "es";
  const missing: string[] = [];

  if (password.length < MIN_LENGTH) {
    missing.push(
      es ? `al menos ${MIN_LENGTH} caracteres` : `at least ${MIN_LENGTH} characters`,
    );
  }
  if (!/[A-Za-zÀ-ÿ]/.test(password)) {
    missing.push(es ? "una letra" : "a letter");
  }
  if (!/[0-9]/.test(password)) {
    missing.push(es ? "un número" : "a number");
  }

  if (missing.length > 0) {
    const joined = joinList(missing, es);
    return {
      ok: false,
      message: es
        ? `Tu contraseña necesita ${joined}.`
        : `Your password needs ${joined}.`,
    };
  }

  if (email) {
    const local = email.split("@")[0]?.toLowerCase();
    if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
      return {
        ok: false,
        message: es
          ? "Tu contraseña no puede contener tu correo. Usa algo diferente."
          : "Your password can't contain your email. Use something different.",
      };
    }
  }

  return { ok: true };
}

/**
 * Translate a Supabase auth error message into a specific, actionable
 * bilingual hint. Use AFTER calling signUp/updateUser and getting an error.
 * Falls back to the raw message if nothing matches.
 */
export function explainAuthError(
  rawMessage: string | undefined | null,
  locale: PasswordLocale,
): string {
  const es = locale === "es";
  const msg = (rawMessage ?? "").toLowerCase();

  // Leaked password (HIBP)
  if (msg.includes("pwned") || msg.includes("compromised") || msg.includes("leak")) {
    return es
      ? "Esa contraseña ha aparecido en filtraciones públicas. Usa una distinta, mezcla letras, números y un símbolo (ej. !, @, #)."
      : "That password has appeared in public leaks. Pick a different one mixing letters, numbers and a symbol (e.g. !, @, #).";
  }

  // Weak / too short / strength
  if (
    msg.includes("weak_password") ||
    msg.includes("password is too weak") ||
    msg.includes("password should") ||
    msg.includes("at least") ||
    msg.includes("characters")
  ) {
    return es
      ? "Tu contraseña es muy débil. Usa 8+ caracteres con letras y números (añade un símbolo como ! o # para más seguridad)."
      : "Your password is too weak. Use 8+ characters with letters and numbers (add a symbol like ! or # for extra strength).";
  }

  // Rate limit
  if (msg.includes("rate") || msg.includes("seconds") || msg.includes("429")) {
    return es
      ? "Demasiados intentos. Espera unos segundos antes de volver a intentarlo."
      : "Too many attempts. Wait a few seconds before trying again.";
  }

  // Already registered
  if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
    return es
      ? "Ya existe una cuenta con ese correo. Inicia sesión o usa '¿Olvidaste tu contraseña?'."
      : "An account with that email already exists. Sign in or use 'Forgot your password?'.";
  }

  // Email confirmation should not leak as a raw backend error in the PWA flow.
  // The project uses auto-confirmed client accounts; if this ever appears,
  // show a neutral recovery message instead of "Email not confirmed".
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
    return es
      ? "Cuenta creada. Intenta iniciar sesión en un momento."
      : "Account created. Try signing in shortly.";
  }

  // Invalid email
  if (msg.includes("invalid") && msg.includes("email")) {
    return es ? "Correo inválido. Revisa el formato." : "Invalid email. Check the format.";
  }

  return (
    rawMessage ||
    (es ? "No pudimos crear tu cuenta. Intenta de nuevo." : "We couldn't create your account. Try again.")
  );
}

function joinList(items: string[], es: boolean): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${es ? "y" : "and"} ${items[1]}`;
  const head = items.slice(0, -1).join(", ");
  const tail = items[items.length - 1];
  return `${head} ${es ? "y" : "and"} ${tail}`;
}
