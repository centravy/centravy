import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createSupplierStep } from "./steps/create-supplier"

type CreateSupplierWorkflowInput = {
  name: string
  email: string
  phone: string
  collection_address?: string
}

export const createSupplierWorkflow = createWorkflow(
  "create-supplier",
  (input: CreateSupplierWorkflowInput) => {
    const supplier = createSupplierStep(input)
    return new WorkflowResponse(supplier)
  }
)
