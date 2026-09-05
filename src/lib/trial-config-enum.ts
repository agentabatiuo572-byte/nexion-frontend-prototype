/**
 * H2's wire contract uses JSON booleans.  These legacy labels are retained
 * only while old backend policy rows are being normalized; every other value
 * is rejected so an ambiguous trial policy can never become eligible.
 */
export function parseTrialBooleanConfig(value: unknown): boolean {
  if (value === true || value === false) return value;
  if (typeof value !== "string") throw new Error("TRIAL_CONFIG_RESPONSE_INVALID");
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "enabled", "on", "开", "开放"].includes(normalized)) return true;
  if (["false", "0", "disabled", "off", "关", "关闭"].includes(normalized)) return false;
  throw new Error("TRIAL_CONFIG_RESPONSE_INVALID");
}
