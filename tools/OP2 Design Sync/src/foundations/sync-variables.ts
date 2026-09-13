namespace OP2Foundations {
  export interface SyncedFoundationVariables {
    primitivesByName: Map<string, Variable>;
    semanticsByName: Map<string, Variable>;
  }

  export async function syncVariableCollections(): Promise<SyncedFoundationVariables> {
    validateTokenDefinitions();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const localVariables = await figma.variables.getLocalVariablesAsync();
    const primitivesCollection = findOrCreateCollection(
      collections,
      PRIMITIVES_COLLECTION_NAME,
    );
    const semanticCollection = findOrCreateCollection(
      collections,
      SEMANTIC_COLLECTION_NAME,
    );

    const primitivesByName = new Map<string, Variable>();
    const semanticsByName = new Map<string, Variable>();

    for (const token of PRIMITIVE_TOKENS) {
      const variable = upsertVariable(
        primitivesCollection,
        localVariables,
        token.name,
        token.resolvedType,
      );
      setValueForEveryMode(primitivesCollection, variable, token.value);
      variable.scopes = [...token.scopes];
      variable.description = `Literal CSS value from ${token.source}: ${token.displayValue}`;

      if (variable.codeSyntax.WEB) {
        variable.removeVariableCodeSyntax('WEB');
      }

      primitivesByName.set(token.name, variable);
    }

    for (const token of SEMANTIC_TOKENS) {
      const primitive = primitivesByName.get(token.primitiveName);

      if (!primitive) {
        throw new Error(`Primitive ausente: ${token.primitiveName}.`);
      }

      const variable = upsertVariable(
        semanticCollection,
        localVariables,
        token.name,
        token.resolvedType,
      );
      const alias = figma.variables.createVariableAlias(primitive);
      setValueForEveryMode(semanticCollection, variable, alias);
      variable.scopes = [...token.scopes];
      variable.description = `Semantic alias for ${token.primitiveName}.`;
      variable.setVariableCodeSyntax('WEB', `var(${token.cssVariable})`);
      semanticsByName.set(token.name, variable);
    }

    return { primitivesByName, semanticsByName };
  }

  function findOrCreateCollection(
    collections: VariableCollection[],
    name: string,
  ): VariableCollection {
    return (
      collections.find(
        (collection) => collection.name === name && !collection.isExtension,
      ) ?? figma.variables.createVariableCollection(name)
    );
  }

  function upsertVariable(
    collection: VariableCollection,
    localVariables: Variable[],
    name: string,
    resolvedType: VariableResolvedDataType,
  ): Variable {
    const existing = localVariables.find(
      (variable) =>
        variable.variableCollectionId === collection.id && variable.name === name,
    );

    if (existing && existing.resolvedType !== resolvedType) {
      throw new Error(
        `A variable ${collection.name}/${name} já existe com tipo incompatível (${existing.resolvedType}).`,
      );
    }

    if (existing) {
      return existing;
    }

    const created = figma.variables.createVariable(name, collection, resolvedType);
    localVariables.push(created);
    return created;
  }

  function setValueForEveryMode(
    collection: VariableCollection,
    variable: Variable,
    value: VariableValue,
  ): void {
    for (const mode of collection.modes) {
      variable.setValueForMode(mode.modeId, value);
    }
  }
}
