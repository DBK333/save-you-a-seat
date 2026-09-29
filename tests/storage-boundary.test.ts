import { vi, it, expect } from "vitest";
it("keeps the demo directory available when browser storage access is denied", async () => {
  vi.resetModules();
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("Storage denied", "SecurityError");
  });
  await expect(import("../src/services/index")).resolves.toHaveProperty(
    "service",
  );
});
