namespace OP2Foundations {
  export type FoundationSection = 'Sheet' | 'Dialog' | 'Metrics';

  export interface PrimitiveToken {
    name: string;
    resolvedType: 'COLOR' | 'FLOAT';
    value: RGB | RGBA | number;
    scopes: VariableScope[];
    displayValue: string;
    source: string;
  }

  export interface SemanticToken {
    name: string;
    primitiveName: string;
    resolvedType: 'COLOR' | 'FLOAT';
    scopes: VariableScope[];
    cssVariable: string;
    section: FoundationSection;
  }

  export const PRIMITIVES_COLLECTION_NAME = 'Primitives';
  export const SEMANTIC_COLLECTION_NAME = 'OP2';
  export const FOUNDATIONS_PAGE_NAME = 'Foundations';
  export const MANAGED_AREA_NAME = 'OP2 / Foundations';

  const SOURCE_AGENT_SHEET = 'styles/agent-sheet.css';
  const SOURCE_CHECK_DIALOG = 'styles/check-dialog.css';
  const SOURCE_ITEM_PICKER = 'styles/single-embedded-item-picker.css';

  const BACKGROUND_SCOPES: VariableScope[] = ['FRAME_FILL', 'SHAPE_FILL'];
  const TEXT_SCOPES: VariableScope[] = ['TEXT_FILL'];
  const BORDER_SCOPES: VariableScope[] = ['STROKE_COLOR'];
  const ACCENT_SCOPES: VariableScope[] = [
    'ALL_FILLS',
    'STROKE_COLOR',
    'EFFECT_COLOR',
  ];
  const FOCUS_SCOPES: VariableScope[] = ['STROKE_COLOR', 'EFFECT_COLOR'];
  const SPACING_SCOPES: VariableScope[] = ['GAP'];
  const RADIUS_SCOPES: VariableScope[] = ['CORNER_RADIUS'];

  function rgb(red: number, green: number, blue: number): RGB {
    return { r: red / 255, g: green / 255, b: blue / 255 };
  }

  function rgba(
    red: number,
    green: number,
    blue: number,
    alpha: number,
  ): RGBA {
    return { ...rgb(red, green, blue), a: alpha };
  }

  function mixSrgbWithWhite(color: RGB, colorWeight: number): RGB {
    return {
      r: color.r * colorWeight + 1 * (1 - colorWeight),
      g: color.g * colorWeight + 1 * (1 - colorWeight),
      b: color.b * colorWeight + 1 * (1 - colorWeight),
    };
  }

  function withAlpha(color: RGB, alpha: number): RGBA {
    return { ...color, a: alpha };
  }

  const DARK_ACCENT = rgb(127, 37, 43);
  const ACCENT_BRIGHT = mixSrgbWithWhite(DARK_ACCENT, 0.9);
  const FOCUS = mixSrgbWithWhite(DARK_ACCENT, 0.58);

  // Confirmed CSS values only. color-mix(..., transparent) is represented
  // using premultiplied-alpha semantics, retaining the source RGB channels.
  export const PRIMITIVE_TOKENS: PrimitiveToken[] = [
    {
      name: 'color/sheet/background',
      resolvedType: 'COLOR',
      value: rgba(18, 20, 24, 0.96),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(18, 20, 24, 0.96)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/panel',
      resolvedType: 'COLOR',
      value: rgba(27, 30, 36, 0.92),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(27, 30, 36, 0.92)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/panel-hover',
      resolvedType: 'COLOR',
      value: rgba(35, 39, 46, 0.96),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(35, 39, 46, 0.96)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/input',
      resolvedType: 'COLOR',
      value: rgba(11, 13, 16, 0.72),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(11, 13, 16, 0.72)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/text',
      resolvedType: 'COLOR',
      value: rgb(241, 242, 244),
      scopes: TEXT_SCOPES,
      displayValue: '#F1F2F4',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/text-muted',
      resolvedType: 'COLOR',
      value: rgb(167, 172, 181),
      scopes: TEXT_SCOPES,
      displayValue: '#A7ACB5',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/border',
      resolvedType: 'COLOR',
      value: rgba(255, 255, 255, 0.1),
      scopes: BORDER_SCOPES,
      displayValue: 'rgba(255, 255, 255, 0.10)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/border-strong',
      resolvedType: 'COLOR',
      value: rgba(255, 255, 255, 0.18),
      scopes: BORDER_SCOPES,
      displayValue: 'rgba(255, 255, 255, 0.18)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/brand/dark',
      resolvedType: 'COLOR',
      value: DARK_ACCENT,
      scopes: ACCENT_SCOPES,
      displayValue: '#7F252B',
      source: `${SOURCE_AGENT_SHEET}; ${SOURCE_CHECK_DIALOG}`,
    },
    {
      name: 'color/sheet/accent-bright',
      resolvedType: 'COLOR',
      value: ACCENT_BRIGHT,
      scopes: ACCENT_SCOPES,
      displayValue: 'rgb(140, 59, 64)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/accent-soft',
      resolvedType: 'COLOR',
      value: withAlpha(DARK_ACCENT, 0.3),
      scopes: ACCENT_SCOPES,
      displayValue: 'rgba(127, 37, 43, 0.30)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/focus',
      resolvedType: 'COLOR',
      value: FOCUS,
      scopes: FOCUS_SCOPES,
      displayValue: 'rgb(181, 129, 132)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/sheet/focus-soft',
      resolvedType: 'COLOR',
      value: withAlpha(FOCUS, 0.28),
      scopes: FOCUS_SCOPES,
      displayValue: 'rgba(181, 129, 132, 0.28)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/dialog/background',
      resolvedType: 'COLOR',
      value: rgba(14, 16, 21, 0.98),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(14, 16, 21, 0.98)',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/panel',
      resolvedType: 'COLOR',
      value: rgba(27, 30, 36, 0.82),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(27, 30, 36, 0.82)',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/panel-hover',
      resolvedType: 'COLOR',
      value: rgba(39, 43, 51, 0.96),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(39, 43, 51, 0.96)',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/input',
      resolvedType: 'COLOR',
      value: rgba(9, 11, 15, 0.78),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(9, 11, 15, 0.78)',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/text',
      resolvedType: 'COLOR',
      value: rgb(241, 238, 229),
      scopes: TEXT_SCOPES,
      displayValue: '#F1EEE5',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/text-muted',
      resolvedType: 'COLOR',
      value: rgb(170, 169, 164),
      scopes: TEXT_SCOPES,
      displayValue: '#AAA9A4',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/border',
      resolvedType: 'COLOR',
      value: rgba(241, 238, 229, 0.18),
      scopes: BORDER_SCOPES,
      displayValue: 'rgba(241, 238, 229, 0.18)',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/border-strong',
      resolvedType: 'COLOR',
      value: rgba(241, 238, 229, 0.36),
      scopes: BORDER_SCOPES,
      displayValue: 'rgba(241, 238, 229, 0.36)',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/accent',
      resolvedType: 'COLOR',
      value: rgb(181, 71, 79),
      scopes: ACCENT_SCOPES,
      displayValue: '#B5474F',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/dialog/copper',
      resolvedType: 'COLOR',
      value: rgb(181, 139, 104),
      scopes: ACCENT_SCOPES,
      displayValue: '#B58B68',
      source: SOURCE_CHECK_DIALOG,
    },
    {
      name: 'color/settings/border',
      resolvedType: 'COLOR',
      value: rgba(255, 255, 255, 0.16),
      scopes: BORDER_SCOPES,
      displayValue: 'rgba(255, 255, 255, 0.16)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/settings/panel',
      resolvedType: 'COLOR',
      value: rgba(11, 13, 16, 0.5),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(11, 13, 16, 0.50)',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'color/picker/panel',
      resolvedType: 'COLOR',
      value: rgba(10, 12, 15, 0.42),
      scopes: BACKGROUND_SCOPES,
      displayValue: 'rgba(10, 12, 15, 0.42)',
      source: SOURCE_ITEM_PICKER,
    },
    {
      name: 'color/picker/border',
      resolvedType: 'COLOR',
      value: rgba(255, 255, 255, 0.16),
      scopes: BORDER_SCOPES,
      displayValue: 'rgba(255, 255, 255, 0.16)',
      source: SOURCE_ITEM_PICKER,
    },
    {
      name: 'color/picker/text-muted-fallback',
      resolvedType: 'COLOR',
      value: rgb(170, 170, 170),
      scopes: TEXT_SCOPES,
      displayValue: '#AAAAAA',
      source: SOURCE_ITEM_PICKER,
    },
    {
      name: 'spacing/4',
      resolvedType: 'FLOAT',
      value: 4,
      scopes: SPACING_SCOPES,
      displayValue: '4 px',
      source: SOURCE_AGENT_SHEET,
    },
    {
      name: 'spacing/8',
      resolvedType: 'FLOAT',
      value: 8,
      scopes: SPACING_SCOPES,
      displayValue: '8 px',
      source: `${SOURCE_AGENT_SHEET}; ${SOURCE_ITEM_PICKER}`,
    },
    {
      name: 'spacing/12',
      resolvedType: 'FLOAT',
      value: 12,
      scopes: SPACING_SCOPES,
      displayValue: '12 px',
      source: `${SOURCE_AGENT_SHEET}; ${SOURCE_CHECK_DIALOG}; ${SOURCE_ITEM_PICKER}`,
    },
    {
      name: 'spacing/16',
      resolvedType: 'FLOAT',
      value: 16,
      scopes: SPACING_SCOPES,
      displayValue: '16 px',
      source: `${SOURCE_AGENT_SHEET}; ${SOURCE_ITEM_PICKER}`,
    },
    {
      name: 'radius/6',
      resolvedType: 'FLOAT',
      value: 6,
      scopes: RADIUS_SCOPES,
      displayValue: '6 px',
      source: `${SOURCE_AGENT_SHEET}; ${SOURCE_ITEM_PICKER}`,
    },
    {
      name: 'radius/8',
      resolvedType: 'FLOAT',
      value: 8,
      scopes: RADIUS_SCOPES,
      displayValue: '8 px',
      source: `${SOURCE_AGENT_SHEET}; ${SOURCE_ITEM_PICKER}`,
    },
  ];

  export const SEMANTIC_TOKENS: SemanticToken[] = [
    semanticColor('op2/sheet-bg', 'color/sheet/background', '--op2-sheet-bg', BACKGROUND_SCOPES, 'Sheet'),
    semanticColor('op2/panel-bg', 'color/sheet/panel', '--op2-panel-bg', BACKGROUND_SCOPES, 'Sheet'),
    semanticColor('op2/panel-bg-hover', 'color/sheet/panel-hover', '--op2-panel-bg-hover', BACKGROUND_SCOPES, 'Sheet'),
    semanticColor('op2/input-bg', 'color/sheet/input', '--op2-input-bg', BACKGROUND_SCOPES, 'Sheet'),
    semanticColor('op2/text', 'color/sheet/text', '--op2-text', TEXT_SCOPES, 'Sheet'),
    semanticColor('op2/text-muted', 'color/sheet/text-muted', '--op2-text-muted', TEXT_SCOPES, 'Sheet'),
    semanticColor('op2/border', 'color/sheet/border', '--op2-border', BORDER_SCOPES, 'Sheet'),
    semanticColor('op2/border-strong', 'color/sheet/border-strong', '--op2-border-strong', BORDER_SCOPES, 'Sheet'),
    semanticColor('op2/accent', 'color/brand/dark', '--op2-accent', ACCENT_SCOPES, 'Sheet'),
    semanticColor('op2/accent-bright', 'color/sheet/accent-bright', '--op2-accent-bright', ACCENT_SCOPES, 'Sheet'),
    semanticColor('op2/accent-soft', 'color/sheet/accent-soft', '--op2-accent-soft', ACCENT_SCOPES, 'Sheet'),
    semanticColor('op2/focus', 'color/sheet/focus', '--op2-focus', FOCUS_SCOPES, 'Sheet'),
    semanticColor('op2/focus-soft', 'color/sheet/focus-soft', '--op2-focus-soft', FOCUS_SCOPES, 'Sheet'),
    semanticFloat('op2/radius', 'radius/8', '--op2-radius', RADIUS_SCOPES),
    semanticFloat('op2/space-1', 'spacing/4', '--op2-space-1', SPACING_SCOPES),
    semanticFloat('op2/space-2', 'spacing/8', '--op2-space-2', SPACING_SCOPES),
    semanticFloat('op2/space-3', 'spacing/12', '--op2-space-3', SPACING_SCOPES),
    semanticFloat('op2/space-4', 'spacing/16', '--op2-space-4', SPACING_SCOPES),
    semanticColor('op2/settings-border', 'color/settings/border', '--op2-settings-border', BORDER_SCOPES, 'Sheet'),
    semanticColor('op2/settings-panel', 'color/settings/panel', '--op2-settings-panel', BACKGROUND_SCOPES, 'Sheet'),
    semanticColor('op2/dialog-bg', 'color/dialog/background', '--op2-dialog-bg', BACKGROUND_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-panel', 'color/dialog/panel', '--op2-dialog-panel', BACKGROUND_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-panel-hover', 'color/dialog/panel-hover', '--op2-dialog-panel-hover', BACKGROUND_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-input', 'color/dialog/input', '--op2-dialog-input', BACKGROUND_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-text', 'color/dialog/text', '--op2-dialog-text', TEXT_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-muted', 'color/dialog/text-muted', '--op2-dialog-muted', TEXT_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-border', 'color/dialog/border', '--op2-dialog-border', BORDER_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-border-strong', 'color/dialog/border-strong', '--op2-dialog-border-strong', BORDER_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-accent', 'color/dialog/accent', '--op2-dialog-accent', ACCENT_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-accent-dark', 'color/brand/dark', '--op2-dialog-accent-dark', ACCENT_SCOPES, 'Dialog'),
    semanticColor('op2/dialog-copper', 'color/dialog/copper', '--op2-dialog-copper', ACCENT_SCOPES, 'Dialog'),
  ];

  export function validateTokenDefinitions(): void {
    assertUniqueNames(PRIMITIVE_TOKENS, 'primitive');
    assertUniqueNames(SEMANTIC_TOKENS, 'semântico');
    const primitivesByName = new Map(
      PRIMITIVE_TOKENS.map((token) => [token.name, token]),
    );

    for (const token of SEMANTIC_TOKENS) {
      const primitive = primitivesByName.get(token.primitiveName);

      if (!primitive) {
        throw new Error(
          `O token ${token.name} referencia o primitive ausente ${token.primitiveName}.`,
        );
      }

      if (primitive.resolvedType !== token.resolvedType) {
        throw new Error(
          `O token ${token.name} e o primitive ${primitive.name} possuem tipos incompatíveis.`,
        );
      }
    }
  }

  function semanticColor(
    name: string,
    primitiveName: string,
    cssVariable: string,
    scopes: VariableScope[],
    section: Exclude<FoundationSection, 'Metrics'>,
  ): SemanticToken {
    return {
      name,
      primitiveName,
      resolvedType: 'COLOR',
      scopes,
      cssVariable,
      section,
    };
  }

  function semanticFloat(
    name: string,
    primitiveName: string,
    cssVariable: string,
    scopes: VariableScope[],
  ): SemanticToken {
    return {
      name,
      primitiveName,
      resolvedType: 'FLOAT',
      scopes,
      cssVariable,
      section: 'Metrics',
    };
  }

  function assertUniqueNames(
    tokens: ReadonlyArray<{ name: string }>,
    category: string,
  ): void {
    const names = new Set<string>();

    for (const token of tokens) {
      if (names.has(token.name)) {
        throw new Error(`Nome de token ${category} duplicado: ${token.name}.`);
      }

      names.add(token.name);
    }
  }
}
