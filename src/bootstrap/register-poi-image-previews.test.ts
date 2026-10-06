import { afterEach, expect, it, vi } from "vitest";
const register = vi.hoisted(() => vi.fn());
vi.mock("../adapters/foundry/points-of-interest/register-poi-item-directory-previews", () => ({ registerPoiItemDirectoryPreviews: register }));
import { registerPoiImagePreviews } from "./register-poi-image-previews";
afterEach(() => vi.clearAllMocks());
it("registers the presentation-only directory adapter during bootstrap", () => {
  registerPoiImagePreviews(); expect(register).toHaveBeenCalledOnce();
});
