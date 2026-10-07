export class AccessChallengeError extends Error {
  override name = "AccessChallengeError";
}

export function accessChallengeErrorMessage(error: unknown): string {
  return error instanceof AccessChallengeError
    ? error.message
    : "Não foi possível criar o desafio. Confira a configuração e tente novamente.";
}
