export function restoreEmptyActorName(
  submitData: Record<string, unknown>,
  currentName: string,
): boolean {
  const submittedName = submitData.name;

  if (typeof submittedName !== "string" || submittedName.trim().length > 0) {
    return false;
  }

  submitData.name = currentName;
  return true;
}
