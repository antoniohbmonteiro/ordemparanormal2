import { GmToolkit } from "./gm-toolkit";

let toolkit: GmToolkit | null = null;

export async function synchronizeGmToolkit(): Promise<void> {
  if (!game.user.isGM || toolkit) return;

  const application = new GmToolkit();
  toolkit = application;
  application.addEventListener("close", () => {
    if (toolkit === application) toolkit = null;
  }, { once: true });

  try {
    await application.render({ force: true });
  } catch (error) {
    if (toolkit === application) toolkit = null;
    throw error;
  }
}
