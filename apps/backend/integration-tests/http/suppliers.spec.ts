import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import jwt from "jsonwebtoken";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Supplier admin routes", () => {
      const headers: Record<string, string> = {};

      beforeAll(async () => {
        const container = getContainer();
        const authService = container.resolve("auth");
        const userService = container.resolve("user");

        const user = await userService.createUsers({
          email: "admin@centravy.test",
        });

        const authIdentity = await authService.createAuthIdentities({
          provider_identities: [
            {
              provider: "emailpass",
              entity_id: "admin@centravy.test",
              provider_metadata: { password: "supersecret" },
            },
          ],
          app_metadata: { user_id: user.id },
        });

        const token = jwt.sign(
          {
            actor_id: user.id,
            actor_type: "user",
            auth_identity_id: authIdentity.id,
          },
          process.env.JWT_SECRET!,
          { expiresIn: "1d" },
        );

        headers["authorization"] = `Bearer ${token}`;
      });

      it("refuse an unauthenticated request", async () => {
        const error = await api.get("/admin/suppliers").catch((e) => e);

        expect(error.response.status).toEqual(401);
      });

      it("accepts an authenticated request", async () => {
        const response = await api.get("/admin/suppliers", { headers });

        expect(response.status).toEqual(200);
      });
    });
  },
});
