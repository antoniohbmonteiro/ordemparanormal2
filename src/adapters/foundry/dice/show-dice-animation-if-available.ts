import { SYSTEM_ID } from "../../../config/system-config";

const DICE_SO_NICE_MODULE_ID = "dice-so-nice";

interface DiceSoNiceApi {
  showForRoll(
    roll: foundry.dice.Roll,
    user: foundry.documents.User,
    synchronize: boolean,
    whisper: null,
    blind: boolean,
  ): Promise<boolean>;
}

interface DiceSoNiceRuntime {
  readonly modules?: {
    get(id: string): { readonly active?: boolean } | undefined;
  };
  readonly dice3d?: Partial<DiceSoNiceApi>;
}

function warnAboutAnimationFailure(error: unknown): void {
  console.warn(
    `${SYSTEM_ID} | Dice So Nice animation failed; continuing with the resolved Check.`,
    error,
  );
}

function waitForAnimationOrHidden(
  animation: Promise<boolean>,
  visibilityDocument: Document,
): Promise<void> {
  if (visibilityDocument.visibilityState === "hidden") {
    void animation.catch(warnAboutAnimationFailure);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      visibilityDocument.removeEventListener("visibilitychange", onVisibilityChange);
      resolve();
    };
    const onVisibilityChange = (): void => {
      if (visibilityDocument.visibilityState === "hidden") finish();
    };

    visibilityDocument.addEventListener("visibilitychange", onVisibilityChange);
    void animation.then(finish, (error) => {
      warnAboutAnimationFailure(error);
      finish();
    });

    // Cover a visibility transition that happened while the listener was installed.
    onVisibilityChange();
  });
}

export async function showDiceAnimationIfAvailable(
  roll: foundry.dice.Roll,
): Promise<void> {
  const runtime = game as typeof game & DiceSoNiceRuntime;
  if (runtime.modules?.get(DICE_SO_NICE_MODULE_ID)?.active !== true) return;

  const dice3d = runtime.dice3d;
  if (typeof dice3d?.showForRoll !== "function") {
    console.warn(
      `${SYSTEM_ID} | Dice So Nice is active, but its showForRoll API is unavailable; continuing without 3D animation.`,
    );
    return;
  }

  try {
    const animation = dice3d.showForRoll(roll, game.user, true, null, false);
    const visibilityDocument = globalThis.document;
    if (!visibilityDocument) {
      await animation;
      return;
    }
    await waitForAnimationOrHidden(animation, visibilityDocument);
  } catch (error) {
    warnAboutAnimationFailure(error);
  }
}
