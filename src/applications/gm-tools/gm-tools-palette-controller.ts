import { GmToolsPalette } from "./gm-tools-palette";

let palette: GmToolsPalette | null = null;

export async function synchronizeGmToolsPalette(): Promise<void> {
  if (!game.user.isGM || palette) return;

  const application = new GmToolsPalette();
  palette = application;
  application.addEventListener("close", () => {
    if (palette === application) palette = null;
  }, { once: true });

  try {
    await application.render({ force: true });
  } catch (error) {
    if (palette === application) palette = null;
    throw error;
  }
}
