## Purpose

Describes how the Medusa Admin dashboard presents suppliers to the operator: the
sidebar entry, the supplier list and its render states, the single-supplier
detail page, and the navigation between them. It covers what the operator sees,
not how the supplier data is stored or served.

## ADDED Requirements

### Requirement: Suppliers entry in the admin sidebar

The admin dashboard SHALL expose a "Suppliers" entry in its sidebar navigation
that opens the supplier list page.

#### Scenario: Sidebar entry is present

- **WHEN** the operator loads the admin dashboard
- **THEN** the sidebar contains an entry labelled "Suppliers", with an icon

#### Scenario: Sidebar entry opens the list

- **WHEN** the operator activates the "Suppliers" sidebar entry
- **THEN** the browser is at the admin path `/app/suppliers` and the supplier
  list page is rendered

### Requirement: Supplier list renders every supplier in a table

The supplier list page SHALL render the suppliers returned by the admin supplier
list endpoint as a table, one row per supplier, showing each supplier's name,
email and phone. It SHALL request the full list without pagination, search or
sort parameters.

#### Scenario: Suppliers exist

- **WHEN** the supplier list endpoint returns three suppliers and the operator
  opens the supplier list page
- **THEN** the page renders a table with a header row and exactly three data
  rows, and each row shows that supplier's name, email and phone

#### Scenario: One request, no query parameters

- **WHEN** the operator opens the supplier list page
- **THEN** exactly one request is made to the admin supplier list endpoint, with
  no pagination, search or sort parameters in its URL

### Requirement: Supplier list has four distinct render states

The supplier list page SHALL render exactly one of four mutually exclusive
states: loading, error, empty, or the table. Each state SHALL be reachable
independently of the others, and no two SHALL be rendered at the same time.

#### Scenario: Request in flight

- **WHEN** the operator opens the supplier list page and the request to the
  supplier list endpoint has not yet resolved
- **THEN** the page renders a loading indicator, and renders no table and no
  error message

#### Scenario: Request fails

- **WHEN** the request to the supplier list endpoint fails
- **THEN** the page renders an error message, and renders no table

#### Scenario: No suppliers exist

- **WHEN** the supplier list endpoint returns zero suppliers
- **THEN** the page renders a message stating that there are no suppliers, and
  renders no table header row

### Requirement: A list row links to that supplier's detail page

Each row of the supplier list SHALL contain a link to the detail page of the
supplier it shows. Activating that link SHALL navigate within the dashboard, without a full page reload.

#### Scenario: Operator activates a row's link

- **WHEN** the operator activates the link in the row for the supplier whose id
  is `sup_01ABC`
- **THEN** the browser is at the admin path `/app/suppliers/sup_01ABC` and that
  supplier's detail page is rendered

#### Scenario: The link is a real link

- **WHEN** the supplier list page is rendered with suppliers present
- **THEN** each row contains an anchor element whose target is that supplier's
  detail path, reachable by keyboard

#### Scenario: The link looks like a link

- **WHEN** the supplier list page is rendered with suppliers present
- **THEN** the linked cell is visually distinguishable from the non-interactive
  cells in the same row

### Requirement: Supplier detail page renders one supplier's fields

The supplier detail page SHALL read the supplier id from the path and render
that supplier's name, email, phone and collection address, and no other
supplier fields.

#### Scenario: Supplier is rendered

- **WHEN** the operator opens the detail page for the supplier whose id is
  `sup_01ABC`
- **THEN** the page renders that supplier's name, email, phone and collection
  address

#### Scenario: Collection address is absent

- **WHEN** the operator opens the detail page for a supplier whose collection
  address is null
- **THEN** the page renders the collection address field with a placeholder
  rather than omitting the field or rendering "null"

### Requirement: Supplier detail page has three distinct render states

The supplier detail page SHALL render exactly one of three mutually exclusive
states: loading, error, or the supplier's fields. A request for a supplier that
does not exist SHALL render the error state.

#### Scenario: Request in flight

- **WHEN** the operator opens a supplier detail page and the request has not yet
  resolved
- **THEN** the page renders a loading indicator, and renders no supplier fields
  and no error message

#### Scenario: Request fails

- **WHEN** the request for the supplier fails
- **THEN** the page renders an error message, and renders no supplier fields

#### Scenario: Supplier does not exist

- **WHEN** the operator opens the detail page for an id that no supplier has,
  and the endpoint answers 404
- **THEN** the page renders an error message, and renders no supplier fields

### Requirement: The API token is never rendered

No supplier page SHALL render a supplier's API token, in any state, whether or
not the endpoint were to return one. See D-003.

#### Scenario: Token absent from the list

- **WHEN** the operator opens the supplier list page with suppliers present
- **THEN** no rendered element contains an API token value, and the table has no
  API token column

#### Scenario: Token absent from the detail page

- **WHEN** the operator opens a supplier's detail page
- **THEN** no rendered element contains an API token value
