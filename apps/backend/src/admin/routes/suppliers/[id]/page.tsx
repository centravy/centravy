import { Spinner } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { sdk, Supplier } from "../../../lib/sdk"

const SupplierDetailPage = () => {
  const { id } = useParams()

  const { data, isPending, isError } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => sdk.client.fetch<{ supplier: Supplier }>(`/admin/suppliers/${id}`),
  })

  if (isPending) {
    return (
      <Container className="flex justify-center px-6 py-4">
        <Spinner className="animate-spin" />
      </Container>
    )
  }

  if (isError) {
    return (
      <Container className="px-6 py-4">
        <Text>Supplier could not be loaded.</Text>
      </Container>
    )
  }

  const supplier = data.supplier

  const fields: [string, string][] = [
    ["Name", supplier.name],
    ["Email", supplier.email],
    ["Phone", supplier.phone],
    ["Collection address", supplier.collection_address ?? "—"],
  ]

  return (
    <Container className="px-6 py-4">
      <div className="flex flex-col gap-y-4">
        {fields.map(([label, value]) => (
          <div key={label}>
            <Text size="small" leading="compact" weight="plus">
              {label}
            </Text>
            <Text size="small" leading="compact">
              {value}
            </Text>
          </div>
        ))}
      </div>
    </Container>
  )
}

export default SupplierDetailPage
