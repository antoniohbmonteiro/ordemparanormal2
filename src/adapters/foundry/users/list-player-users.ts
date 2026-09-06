export interface PlayerUser {
  readonly id: string;
  readonly name: string;
}

interface WorldUser {
  readonly id: string | null;
  readonly name?: string | null;
  readonly isGM: boolean;
}

/**
 * World `User` documents that are not Game Masters. First consumer of
 * `game.users` in the system.
 */
export function listPlayerUsers(): readonly PlayerUser[] {
  const users = (game as typeof game & { users?: Iterable<WorldUser> }).users;
  if (!users) return [];
  const players: PlayerUser[] = [];
  for (const user of users) {
    if (user.isGM || !user.id) continue;
    players.push({ id: user.id, name: user.name ?? user.id });
  }
  return players;
}
