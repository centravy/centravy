import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// The port root serves nothing of its own. Send it to the admin dashboard so a
// bare forwarded URL lands somewhere useful instead of a 404.
export const GET = (req: MedusaRequest, res: MedusaResponse) => {
  res.redirect("/app")
}
