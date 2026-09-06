import { SYSTEM_ID } from "../../../config/system-config";

const REVEAL_NOTICE_KEY = "ORDEMPARANORMAL2.PointOfInterest.Reveal.Notice";

/**
 * Whispers a generic "something new caught your attention" notice, one private
 * message per user. The content carries no POI identity, scene name or geometry.
 * Best-effort: a failed `ChatMessage.create` is logged and never propagates, so
 * one bad recipient does not block the rest.
 */
export async function publishPoiRevealNotice(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  const content = `<p>${game.i18n.localize(REVEAL_NOTICE_KEY)}</p>`;
  for (const userId of userIds) {
    try {
      await ChatMessage.create({
        content,
        whisper: [userId],
        flags: { [SYSTEM_ID]: { poiRevealNotice: true } },
      });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | POI reveal notice not delivered`, error);
    }
  }
}
