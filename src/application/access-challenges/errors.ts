export class AccessChallengeError extends Error {
  override name = "AccessChallengeError";

  constructor(
    readonly localizationKey: `ORDEMPARANORMAL2.AccessChallenges.${string}`,
    readonly parameters?: Readonly<Record<string, string | number>>,
  ) { super(localizationKey); }
}

export function accessChallengeErrorMessage(
  error: unknown,
  localize: (key: string) => string,
  format: (key: string, parameters: Readonly<Record<string, string | number>>) => string,
): string {
  if (!(error instanceof AccessChallengeError)) return localize("ORDEMPARANORMAL2.AccessChallenges.Errors.Create");
  return error.parameters ? format(error.localizationKey, error.parameters) : localize(error.localizationKey);
}
