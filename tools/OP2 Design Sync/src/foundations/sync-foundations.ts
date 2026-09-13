namespace OP2Foundations {
  const LEGACY_TEXT_STYLE_NAMES = new Set([
    'Body/Default',
    'Body/Strong',
    'Label/Field',
    'Section/Header',
    'Title/Agent',
    'Dialog/Title',
  ]);

  export interface SyncFoundationsResult {
    primitiveCount: number;
    semanticCount: number;
    removedLegacyTextStyles: number;
    preservedLegacyTextStyles: number;
  }

  export async function syncFoundations(): Promise<SyncFoundationsResult> {
    const page = await findOrCreateFoundationsPage();
    await figma.setCurrentPageAsync(page);
    const placement = prepareManagedAreaPlacement(page);
    const syncedVariables = await syncVariableCollections();
    const nextArea = await buildFoundationsArea(
      page,
      placement,
      syncedVariables,
    );

    replaceManagedArea(page, nextArea);
    const legacyStyles = await removeUnusedLegacyTextStyles();
    page.selection = [nextArea];
    figma.viewport.scrollAndZoomIntoView([nextArea]);

    return {
      primitiveCount: syncedVariables.primitivesByName.size,
      semanticCount: syncedVariables.semanticsByName.size,
      removedLegacyTextStyles: legacyStyles.removed,
      preservedLegacyTextStyles: legacyStyles.preserved,
    };
  }

  async function removeUnusedLegacyTextStyles(): Promise<{
    removed: number;
    preserved: number;
  }> {
    const textStyles = await figma.getLocalTextStylesAsync();
    let removed = 0;
    let preserved = 0;

    for (const style of textStyles) {
      if (!LEGACY_TEXT_STYLE_NAMES.has(style.name)) {
        continue;
      }

      const consumers = await style.getStyleConsumersAsync();

      if (consumers.length > 0) {
        preserved += 1;
        continue;
      }

      style.remove();
      removed += 1;
    }

    return { removed, preserved };
  }
}
