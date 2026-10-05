export function agentNameFromZipEntries(portraitEntryPath: string, tokenEntryPath: string): string {
  function name(path: string, prefix: "Personagem" | "Token"): string {
    const basename = path.split(/[\\/]/u).at(-1) ?? "";
    const match = basename.match(new RegExp(`^${prefix} - (.+)\\.[^.]+$`, "u"));
    if (!match?.[1]?.trim()) throw new Error(`Nome ausente no entry de ${prefix}.`);
    return match[1];
  }
  const portrait = name(portraitEntryPath, "Personagem");
  const token = name(tokenEntryPath, "Token");
  if (portrait.normalize("NFKC") !== token.normalize("NFKC")) {
    throw new Error("Portrait e Token identificam personagens diferentes.");
  }
  return portrait;
}
