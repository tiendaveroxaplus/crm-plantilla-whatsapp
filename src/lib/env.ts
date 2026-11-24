export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar la variable ${name}.`);
  return value;
}

export function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}
