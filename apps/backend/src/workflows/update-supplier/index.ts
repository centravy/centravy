import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateSupplierStep } from "./steps/update-supplier"

type UpdateSupplierWorkflowInput = {
  id: string
  name?: string
  email?: string
  phone?: string
  collection_address?: string
}

export const updateSupplierWorkflow = createWorkflow(
  "update-supplier",
  (input: UpdateSupplierWorkflowInput) => {
    const supplier = updateSupplierStep(input)
    return new WorkflowResponse(supplier)
  }
)
