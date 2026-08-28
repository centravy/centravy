import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Buildings, Spinner } from "@medusajs/icons"
import { Container, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { sdk, Supplier } from "../../lib/sdk"

const SuppliersPage = () => {
  const { data, isPending, isError } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => sdk.client.fetch<{ suppliers: Supplier[] }>("/admin/suppliers"),
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
        <Text>Suppliers could not be loaded.</Text>
      </Container>
    )
  }

  const suppliers = data.suppliers

  if (suppliers.length === 0) {
    return (
      <Container className="px-6 py-4">
        <Text>There are no suppliers yet.</Text>
      </Container>
    )
  }

  return (
    <Container className="px-6 py-4">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
            <Table.HeaderCell>Email</Table.HeaderCell>
            <Table.HeaderCell>Phone</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {suppliers.map((supplier) => (
            <Table.Row key={supplier.id}>
              <Table.Cell>
                <Link to={`/suppliers/${supplier.id}`} className="text-ui-fg-interactive hover:underline">
                  <Text>{supplier.name}</Text>
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Text>{supplier.email}</Text>
              </Table.Cell>
              <Table.Cell>
                <Text>{supplier.phone}</Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Suppliers",
  icon: Buildings,
})

export default SuppliersPage
