export function canUserRollActor(
  actor: foundry.documents.Actor,
  user: foundry.documents.User,
): boolean {
  return (
    user.isGM ||
    actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
  );
}
