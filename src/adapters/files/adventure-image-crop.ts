import type { AdventureImageCropRecipe } from "../../core/adventure-import/adventure-definition";

export interface AdventureImageCropPort {
  inspect(path: string, width: number, height: number): Promise<"valid" | "invalid">;
  crop(sourcePath: string, recipe: AdventureImageCropRecipe): Promise<Blob>;
}

export function createAdventureImageCropPort(): AdventureImageCropPort {
  // Public v14 utility missing from the installed Foundry declarations.
  const utils = foundry.utils as typeof foundry.utils & { fetchResource(src: string): Promise<Blob> };
  return {
    async inspect(path, width, height) {
      const blob = await utils.fetchResource(path);
      try {
        const bitmap = await createImageBitmap(blob);
        try { return bitmap.width === width && bitmap.height === height ? "valid" : "invalid"; }
        finally { bitmap.close(); }
      } catch (error) {
        if (error instanceof DOMException && (error.name === "InvalidStateError" || error.name === "EncodingError")) return "invalid";
        throw error;
      }
    },
    async crop(sourcePath, recipe) {
      const blob = await utils.fetchResource(sourcePath);
      const bitmap = await createImageBitmap(blob);
      try {
        const { x, y, width, height } = recipe.crop;
        if (x + width > bitmap.width || y + height > bitmap.height) throw new Error("Crop fora dos limites do mapa.");
        const canvas = document.createElement("canvas");
        canvas.width = recipe.target.width;
        canvas.height = recipe.target.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D indisponível.");
        context.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
        const result = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => {
          if (value) resolve(value); else reject(new Error("Falha ao serializar o crop."));
        }, recipe.target.mimeType));
        if (result.type !== recipe.target.mimeType) throw new Error("Formato do crop inesperado.");
        return result;
      } finally { bitmap.close(); }
    },
  };
}
