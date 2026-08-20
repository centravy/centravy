import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteSupplierStep } from "./steps/delete-supplier"

type DeleteSupplierWorkflowInput = {
  id: string
}

export const deleteSupplierWorkflow = createWorkflow(
  "delete-supplier",
  (input: DeleteSupplierWorkflowInput) => {
    const supplierId = deleteSupplierStep(input)
    return new WorkflowResponse(supplierId)
  }
)
