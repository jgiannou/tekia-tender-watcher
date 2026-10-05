/**
 * Ops Desk can show the last ops-issued password.
 * Default ON (internal ADMIN_TOKEN tool). Set OPS_PASSWORD_VISIBLE=0 to disable storage.
 */

export const opsPasswordEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const raw = String(env.OPS_PASSWORD_VISIBLE ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
};

export const opsPasswordWrite = (password: string) =>
  opsPasswordEnabled()
    ? { opsPassword: password, opsPasswordAt: new Date() }
    : { opsPassword: null as string | null, opsPasswordAt: null as Date | null };

export const opsPasswordClear = () => ({
  opsPassword: null as string | null,
  opsPasswordAt: null as Date | null,
});
