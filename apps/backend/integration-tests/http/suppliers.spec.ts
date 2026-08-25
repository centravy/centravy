import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import jwt from "jsonwebtoken";
import { InferTypeOf } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { SUPPLIER_MODULE } from "../../src/modules/supplier";
import Supplier from "../../src/modules/supplier/models/supplier";

// The row shape as the model defines it, so the fixture type cannot drift from
// the model the way a hand-written one would.
type SupplierRow = InferTypeOf<typeof Supplier>;

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

      // These two carry no data dependency on purpose: no fixture hook applies
      // to them, so a failure here means the harness or the auth middleware
      // broke, never the fixture.
      it("refuses an unauthenticated request", async () => {
        const error = await api.get("/admin/suppliers").catch((e) => e);

        expect(error.response.status).toEqual(401);
      });

      it("accepts an authenticated request", async () => {
        const response = await api.get("/admin/suppliers", { headers });

        expect(response.status).toEqual(200);
      });

      // Outside the fixture block: this test creates the supplier it asserts on,
      // so a pre-existing row would be dead weight. Its own counter keeps the
      // email unique against the unique constraint.
      describe("POST /admin/suppliers", () => {
        let createdCount = 0;

        it("creates a supplier and returns its api_token", async () => {
          createdCount++;

          const response = await api.post(
            "/admin/suppliers",
            {
              name: `Created Supplier ${createdCount}`,
              email: `created-${createdCount}@centravy.test`,
              phone: "0600000001",
            },
            { headers },
          );

          expect(response.status).toEqual(201);
          expect(response.data.supplier).toEqual(
            expect.objectContaining({
              id: expect.any(String),
              name: `Created Supplier ${createdCount}`,
              email: `created-${createdCount}@centravy.test`,
              // D-003: creation is the only endpoint that returns the token.
              api_token: expect.any(String),
            }),
          );
        });
      });

      describe("with an existing supplier", () => {
        // The suite never truncates between tests -- the admin user created in
        // beforeAll has to survive -- so every fixture carries its own counter
        // value. email and api_token are both unique columns and a fixed value
        // would collide on the second beforeEach.
        let supplierCount = 0;
        let supplier: SupplierRow;

        beforeEach(async () => {
          supplierCount++;

          // Through the container, not over HTTP: a fixture built with the
          // create route would make a broken POST fail every test below.
          const supplierService = getContainer().resolve(SUPPLIER_MODULE);

          supplier = await supplierService.createSuppliers({
            name: `Fixture Supplier ${supplierCount}`,
            email: `fixture-${supplierCount}@centravy.test`,
            phone: "0600000000",
            collection_address: "1 rue du Test, Casablanca",
            // Supplied by hand: the column is non-nullable and unique, and only
            // createSupplierStep generates a token. The service does not.
            api_token: `fixture-token-${supplierCount}`,
          });
        });

        describe("GET /admin/suppliers", () => {
          it("lists suppliers without api_token on any of them", async () => {
            const response = await api.get("/admin/suppliers", { headers });

            expect(response.status).toEqual(200);

            // Guards the loop below: forEach over an empty array passes
            // silently, so without this the test would go green on a route
            // returning nothing.
            expect(
              response.data.suppliers.some((s) => s.id === supplier.id),
            ).toBe(true);

            response.data.suppliers.forEach((s) => {
              expect(s).not.toHaveProperty("api_token");
            });
          });
        });

        describe("GET /admin/suppliers/:id", () => {
          it("returns the supplier without its api_token", async () => {
            const response = await api.get(`/admin/suppliers/${supplier.id}`, {
              headers,
            });

            expect(response.status).toEqual(200);
            expect(response.data.supplier.id).toEqual(supplier.id);
            expect(response.data.supplier).not.toHaveProperty("api_token");
          });

          // D-008: the route runs its own listSuppliers({ id }) guard.
          it("returns 404 for an unknown id", async () => {
            const error = await api
              .get("/admin/suppliers/sup_does_not_exist", { headers })
              .catch((e) => e);

            expect(error.response.status).toEqual(404);
          });
        });

        // POST on the detail path, not PATCH. See D-010.
        describe("POST /admin/suppliers/:id", () => {
          it("updates the supplier and returns no api_token", async () => {
            const response = await api.post(
              `/admin/suppliers/${supplier.id}`,
              { name: "Updated Name" },
              { headers },
            );

            expect(response.status).toEqual(200);
            expect(response.data.supplier.id).toEqual(supplier.id);
            expect(response.data.supplier.name).toEqual("Updated Name");
            expect(response.data.supplier).not.toHaveProperty("api_token");
          });

          // The load-bearing one. The route has no existence check of its own:
          // the 404 comes from inside updateSupplierStep, two files away. The
          // body is deliberately valid, so a 400 from the validator cannot
          // stand in for the 404 this asserts.
          it("returns 404 for an unknown id", async () => {
            const error = await api
              .post(
                "/admin/suppliers/sup_does_not_exist",
                { name: "Updated Name" },
                { headers },
              )
              .catch((e) => e);

            expect(error.response.status).toEqual(404);
          });

          // Sent to the fixture's real id, so z.email() in UpdateSupplierSchema
          // is the only thing that can fail. An unknown id here would test
          // 400-vs-404 ordering instead of the validator.
          it("returns 400 for an invalid email", async () => {
            const error = await api
              .post(
                `/admin/suppliers/${supplier.id}`,
                { email: "not-an-email" },
                { headers },
              )
              .catch((e) => e);

            expect(error.response.status).toEqual(400);
            // The status alone does not pin the validator: dropping email from
            // the schema entirely also answers 400, with
            // "Unrecognized fields: 'email'". Asserting Zod's own message for
            // z.email() is what distinguishes "rejected as malformed" from
            // "rejected as unknown".
            expect(error.response.data.message).toContain(
              "Invalid email address",
            );
          });
        });

        // D-007: delete is idempotent and performs no existence check, matching
        // what core Medusa answers on a repeated DELETE.
        describe("DELETE /admin/suppliers/:id", () => {
          it("returns 200 both times when called twice", async () => {
            const first = await api.delete(`/admin/suppliers/${supplier.id}`, {
              headers,
            });

            expect(first.status).toEqual(200);
            expect(first.data).toEqual({
              id: supplier.id,
              object: "supplier",
              deleted: true,
            });

            const second = await api.delete(`/admin/suppliers/${supplier.id}`, {
              headers,
            });

            expect(second.status).toEqual(200);
            expect(second.data.deleted).toBe(true);
          });
        });

        describe("GET /admin/suppliers/:id/products", () => {
          it("returns a product linked to the supplier, with both prices", async () => {
            const container = getContainer();

            // The integration test database only gets module migrations,
            // not initial-data-seed.ts (that's a separate migration-scripts
            // mechanism the test runner's migrateDatabase() doesn't invoke),
            // so there is no seeded product here to find. Created through
            // the container, per D-012.
            const productService = container.resolve(Modules.PRODUCT);
            const [product] = await productService.createProducts([
              {
                title: "CV-16 Test Product",
                handle: "cv-16-test-product",
                options: [{ title: "Size", values: ["One Size"] }],
                variants: [
                  {
                    title: "One Size",
                    options: { Size: "One Size" },
                  },
                ],
              },
            ]);

            // Through the link utility directly, not HTTP. Same principle as
            // D-012 (fixture the setup, not the thing under test), applied
            // to the link utility instead of a module service.
            const link = container.resolve(ContainerRegistrationKeys.LINK);
            await link.create({
              [Modules.PRODUCT]: { product_id: product.id },
              [SUPPLIER_MODULE]: { supplier_id: supplier.id },
              data: { wholesale_price: 5000, retail_price: 8500 },
            });

            const response = await api.get(
              `/admin/suppliers/${supplier.id}/products`,
              { headers },
            );

            expect(response.status).toEqual(200);
            expect(response.data.products).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: product.id,
                  wholesale_price: 5000,
                  retail_price: 8500,
                }),
              ]),
            );
          });
        });
      });
    });
  },
});
