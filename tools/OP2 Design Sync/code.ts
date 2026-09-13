type PluginMessage = {
  type: 'sync-foundations';
};

figma.showUI(__html__, {
  width: 280,
  height: 176,
  title: 'OP2 Design Sync',
  themeColors: true,
});

figma.ui.onmessage = async (message: PluginMessage) => {
  if (message.type !== 'sync-foundations') {
    return;
  }

  try {
    const result = await OP2Foundations.syncFoundations();
    const messageText = `${result.semanticCount} tokens semânticos sincronizados.`;

    figma.ui.postMessage({
      type: 'sync-result',
      status: 'success',
      message: messageText,
    });
    figma.notify(messageText);
  } catch (error: unknown) {
    const messageText =
      error instanceof Error
        ? error.message
        : 'Não foi possível sincronizar as Foundations.';

    figma.ui.postMessage({
      type: 'sync-result',
      status: 'error',
      message: messageText,
    });
    figma.notify(messageText, { error: true });
  }
};
