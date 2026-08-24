import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("Supplier admin routes", () => {
      it("refuse une requête non authentifiée", async () => {
        const error = await api.get("/admin/suppliers").catch((e) => e);

        expect(error.response.status).toEqual(401);
      });
    });
  },
});
