namespace OP2Foundations {
  const AREA_WIDTH = 1200;
  const SECTION_WIDTH = 520;
  const CONTENT_WIDTH = 472;

  export interface ManagedAreaPlacement {
    x: number;
    y: number;
  }

  export async function findOrCreateFoundationsPage(): Promise<PageNode> {
    await figma.loadAllPagesAsync();

    const existing = figma.root.children.find(
      (page) => page.name === FOUNDATIONS_PAGE_NAME,
    );

    if (existing) {
      return existing;
    }

    const page = figma.createPage();
    page.name = FOUNDATIONS_PAGE_NAME;
    return page;
  }

  export function prepareManagedAreaPlacement(
    page: PageNode,
  ): ManagedAreaPlacement {
    const temporaryName = `${MANAGED_AREA_NAME} (updating)`;

    for (const node of page.children.filter((child) => child.name === temporaryName)) {
      node.remove();
    }

    const existing = page.children.find(
      (child) => child.name === MANAGED_AREA_NAME,
    );

    if (existing) {
      return { x: existing.x, y: existing.y };
    }

    const rightEdge = page.children.reduce(
      (maximum, child) => Math.max(maximum, child.x + child.width),
      -200,
    );

    return { x: rightEdge + 200, y: 0 };
  }

  export async function buildFoundationsArea(
    page: PageNode,
    placement: ManagedAreaPlacement,
    syncedVariables: SyncedFoundationVariables,
  ): Promise<FrameNode> {
    await figma.setCurrentPageAsync(page);
    const fontName = await loadDocumentationFont();
    const area = createLayoutFrame(
      `${MANAGED_AREA_NAME} (updating)`,
      'VERTICAL',
      AREA_WIDTH,
      32,
    );

    try {
      area.x = placement.x;
      area.y = placement.y;
      area.paddingTop = 64;
      area.paddingRight = 64;
      area.paddingBottom = 64;
      area.paddingLeft = 64;
      area.fills = [semanticPaint('op2/sheet-bg', syncedVariables)];
      area.setPluginData('managed-area', 'foundations-v1');

      area.appendChild(
        createText(
          'OP2 Foundations',
          32,
          fontName,
          'op2/text',
          syncedVariables,
        ),
      );
      area.appendChild(
        createText(
          'Tokens confirmados pelo CSS atual do sistema.',
          14,
          fontName,
          'op2/text-muted',
          syncedVariables,
        ),
      );

      const columns = createLayoutFrame('Foundation sections', 'HORIZONTAL', 1064, 24);
      columns.appendChild(
        createColorSection('Sheet', 'Sheet colors', fontName, syncedVariables),
      );
      columns.appendChild(
        createColorSection('Dialog', 'Dialog colors', fontName, syncedVariables),
      );
      area.appendChild(columns);

      area.appendChild(createMetricsSection(fontName, syncedVariables));
      area.appendChild(
        createTypographyNote(fontName, syncedVariables),
      );

      return area;
    } catch (error: unknown) {
      area.remove();
      throw error;
    }
  }

  export function replaceManagedArea(page: PageNode, nextArea: FrameNode): void {
    for (const node of page.children.filter(
      (child) => child !== nextArea && child.name === MANAGED_AREA_NAME,
    )) {
      node.remove();
    }

    nextArea.name = MANAGED_AREA_NAME;
  }

  function createColorSection(
    section: Exclude<FoundationSection, 'Metrics'>,
    name: string,
    fontName: FontName,
    syncedVariables: SyncedFoundationVariables,
  ): FrameNode {
    const backgroundToken = section === 'Sheet' ? 'op2/panel-bg' : 'op2/dialog-panel';
    const textToken = section === 'Sheet' ? 'op2/text' : 'op2/dialog-text';
    const mutedToken = section === 'Sheet' ? 'op2/text-muted' : 'op2/dialog-muted';
    const panel = createLayoutFrame(name, 'VERTICAL', SECTION_WIDTH, 16);
    panel.paddingTop = 24;
    panel.paddingRight = 24;
    panel.paddingBottom = 24;
    panel.paddingLeft = 24;
    panel.fills = [semanticPaint(backgroundToken, syncedVariables)];
    panel.cornerRadius = 8;
    bindRadius(
      panel,
      getSemanticVariable('op2/radius', syncedVariables),
    );
    panel.appendChild(
      createText(section, 24, fontName, textToken, syncedVariables),
    );

    for (const token of SEMANTIC_TOKENS.filter(
      (candidate) =>
        candidate.section === section && candidate.resolvedType === 'COLOR',
    )) {
      panel.appendChild(
        createColorTokenRow(
          token,
          fontName,
          textToken,
          mutedToken,
          syncedVariables,
        ),
      );
    }

    return panel;
  }

  function createColorTokenRow(
    token: SemanticToken,
    fontName: FontName,
    textToken: string,
    mutedToken: string,
    syncedVariables: SyncedFoundationVariables,
  ): FrameNode {
    const row = createLayoutFrame(`Swatch / ${token.name}`, 'HORIZONTAL', CONTENT_WIDTH, 16);
    row.counterAxisAlignItems = 'CENTER';

    const swatch = figma.createRectangle();
    swatch.name = token.name;
    swatch.resize(64, 48);
    swatch.cornerRadius = 8;
    swatch.fills = [semanticPaint(token.name, syncedVariables)];
    swatch.strokes = [semanticPaint('op2/border-strong', syncedVariables)];
    bindRadius(
      swatch,
      getSemanticVariable('op2/radius', syncedVariables),
    );
    row.appendChild(swatch);

    const details = createLayoutFrame(`Details / ${token.name}`, 'VERTICAL', 392, 4);
    details.appendChild(
      createText(token.name, 14, fontName, textToken, syncedVariables),
    );
    details.appendChild(
      createText(
        getPrimitiveToken(token.primitiveName).displayValue,
        12,
        fontName,
        mutedToken,
        syncedVariables,
      ),
    );
    details.appendChild(
      createText(
        `var(${token.cssVariable})`,
        12,
        fontName,
        mutedToken,
        syncedVariables,
      ),
    );
    row.appendChild(details);
    return row;
  }

  function createMetricsSection(
    fontName: FontName,
    syncedVariables: SyncedFoundationVariables,
  ): FrameNode {
    const panel = createLayoutFrame('Spacing and radius', 'VERTICAL', 1064, 20);
    panel.paddingTop = 24;
    panel.paddingRight = 24;
    panel.paddingBottom = 24;
    panel.paddingLeft = 24;
    panel.fills = [semanticPaint('op2/panel-bg', syncedVariables)];
    panel.cornerRadius = 8;
    bindRadius(
      panel,
      getSemanticVariable('op2/radius', syncedVariables),
    );
    panel.appendChild(
      createText('Spacing', 24, fontName, 'op2/text', syncedVariables),
    );

    const spacingRow = createLayoutFrame('Spacing scale', 'HORIZONTAL', 1016, 24);

    for (const token of SEMANTIC_TOKENS.filter(
      (candidate) => candidate.name.startsWith('op2/space-'),
    )) {
      spacingRow.appendChild(
        createSpacingExample(token, fontName, syncedVariables),
      );
    }

    panel.appendChild(spacingRow);
    panel.appendChild(
      createText('Radius', 24, fontName, 'op2/text', syncedVariables),
    );

    const radiusRow = createLayoutFrame('Radius example', 'HORIZONTAL', 1016, 20);
    radiusRow.counterAxisAlignItems = 'CENTER';
    const radiusExample = figma.createRectangle();
    radiusExample.name = '8 px radius example';
    radiusExample.resize(160, 72);
    radiusExample.cornerRadius = 8;
    radiusExample.fills = [semanticPaint('op2/accent', syncedVariables)];
    bindRadius(
      radiusExample,
      getSemanticVariable('op2/radius', syncedVariables),
    );
    radiusRow.appendChild(radiusExample);
    radiusRow.appendChild(
      createText(
        '8 px · op2/radius · var(--op2-radius)',
        14,
        fontName,
        'op2/text',
        syncedVariables,
      ),
    );
    panel.appendChild(radiusRow);
    return panel;
  }

  function createSpacingExample(
    token: SemanticToken,
    fontName: FontName,
    syncedVariables: SyncedFoundationVariables,
  ): FrameNode {
    const card = createLayoutFrame(`Spacing / ${token.name}`, 'VERTICAL', 236, 10);
    const primitive = getPrimitiveToken(token.primitiveName);
    const value = primitive.value;

    if (typeof value !== 'number') {
      throw new Error(`Spacing inválido: ${token.name}.`);
    }

    card.appendChild(
      createText(
        `${primitive.displayValue} · ${token.name}`,
        13,
        fontName,
        'op2/text',
        syncedVariables,
      ),
    );
    card.appendChild(
      createText(
        `var(${token.cssVariable})`,
        11,
        fontName,
        'op2/text-muted',
        syncedVariables,
      ),
    );

    const track = figma.createFrame();
    track.name = `Visual / ${primitive.displayValue}`;
    track.resize(200, 24);
    track.fills = [semanticPaint('op2/input-bg', syncedVariables)];
    track.cornerRadius = 4;

    const bar = figma.createRectangle();
    bar.name = primitive.displayValue;
    bar.resize(value, 24);
    bar.fills = [semanticPaint('op2/accent-bright', syncedVariables)];
    bar.setBoundVariable(
      'width',
      getSemanticVariable(token.name, syncedVariables),
    );
    track.appendChild(bar);
    card.appendChild(track);
    return card;
  }

  function createTypographyNote(
    fontName: FontName,
    syncedVariables: SyncedFoundationVariables,
  ): FrameNode {
    const note = createLayoutFrame('Typography note', 'VERTICAL', 1064, 8);
    note.paddingTop = 20;
    note.paddingRight = 20;
    note.paddingBottom = 20;
    note.paddingLeft = 20;
    note.fills = [semanticPaint('op2/input-bg', syncedVariables)];
    note.cornerRadius = 8;
    bindRadius(
      note,
      getSemanticVariable('op2/radius', syncedVariables),
    );
    note.appendChild(
      createText(
        'Tipografia: herdada do Foundry/runtime. O projeto ainda não define uma font-family própria.',
        14,
        fontName,
        'op2/text',
        syncedVariables,
      ),
    );
    return note;
  }

  function createLayoutFrame(
    name: string,
    direction: 'HORIZONTAL' | 'VERTICAL',
    width: number,
    gap: number,
  ): FrameNode {
    const frame = figma.createFrame();
    frame.name = name;
    frame.resize(width, 100);
    frame.layoutMode = direction;
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'FIXED';
    frame.itemSpacing = gap;
    frame.fills = [];
    frame.clipsContent = false;
    return frame;
  }

  function createText(
    characters: string,
    fontSize: number,
    fontName: FontName,
    colorToken: string,
    syncedVariables: SyncedFoundationVariables,
  ): TextNode {
    const text = figma.createText();
    text.fontName = fontName;
    text.fontSize = fontSize;
    text.characters = characters;
    text.fills = [semanticPaint(colorToken, syncedVariables)];
    return text;
  }

  function semanticPaint(
    semanticName: string,
    syncedVariables: SyncedFoundationVariables,
  ): SolidPaint {
    const semanticToken = SEMANTIC_TOKENS.find(
      (token) => token.name === semanticName,
    );

    if (!semanticToken || semanticToken.resolvedType !== 'COLOR') {
      throw new Error(`Token de cor semântico ausente: ${semanticName}.`);
    }

    const primitive = getPrimitiveToken(semanticToken.primitiveName);

    if (typeof primitive.value === 'number') {
      throw new Error(`Primitive de cor inválido: ${primitive.name}.`);
    }

    const value = primitive.value;
    const paint: SolidPaint = {
      type: 'SOLID',
      color: { r: value.r, g: value.g, b: value.b },
    };

    return figma.variables.setBoundVariableForPaint(
      paint,
      'color',
      getSemanticVariable(semanticName, syncedVariables),
    );
  }

  function getSemanticVariable(
    name: string,
    syncedVariables: SyncedFoundationVariables,
  ): Variable {
    const variable = syncedVariables.semanticsByName.get(name);

    if (!variable) {
      throw new Error(`Variable semântica ausente: ${name}.`);
    }

    return variable;
  }

  function bindRadius(
    node: FrameNode | RectangleNode,
    variable: Variable,
  ): void {
    node.setBoundVariable('topLeftRadius', variable);
    node.setBoundVariable('topRightRadius', variable);
    node.setBoundVariable('bottomLeftRadius', variable);
    node.setBoundVariable('bottomRightRadius', variable);
  }

  function getPrimitiveToken(name: string): PrimitiveToken {
    const primitive = PRIMITIVE_TOKENS.find((token) => token.name === name);

    if (!primitive) {
      throw new Error(`Definição primitive ausente: ${name}.`);
    }

    return primitive;
  }

  async function loadDocumentationFont(): Promise<FontName> {
    const probe = figma.createText();
    const fontName = probe.fontName;
    probe.remove();

    if (fontName === figma.mixed) {
      throw new Error('Não foi possível determinar a fonte padrão do Figma.');
    }

    await figma.loadFontAsync(fontName);
    return fontName;
  }
}
