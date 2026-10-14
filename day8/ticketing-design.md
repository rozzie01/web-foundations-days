# TicketHub: Event Ticketing System Design

## 1. Context

TicketHub is an online event ticketing platform where users can
discover concerts and events, view available seats, reserve seats,
make payments, and access their purchased tickets.

The system must support 2 million registered users and remain
reliable when a popular concert goes on sale and many customers
attempt to purchase tickets simultaneously.

The main engineering challenge is to handle high traffic while
ensuring that the same seat cannot be sold to more than one customer.

## 2. Goals and Non-Goals

### Goals

- Allow users to browse events and view event details.
- Display the seats available for each event.
- Allow users to temporarily hold available seats.
- Process payments and confirm successful orders.
- Allow users to view their purchased tickets.
- Prevent two customers from purchasing the same seat.
- Remain responsive during high-demand ticket sales.
- Protect user accounts and payment-related information.

### Non-Goals

- Building a social network for event attendees.
- Organizing or managing the concerts themselves.
- Developing a custom payment processing system.
- Providing live video streaming of events.

## 3. Requirements

### 3.1 Functional Requirements

1. Users can register and log in.
2. Users can browse and search for events.
3. Users can view event details, prices, and available seats.
4. Authenticated users can temporarily hold available seats.
5. A seat hold expires if payment is not completed within the
   allowed time.
6. Users can pay for their orders through an external payment provider.
7. The system confirms an order after verifying successful payment.
8. Users can view their confirmed tickets.
9. Users receive a clear message when a seat is unavailable,
   a reservation expires, or a payment fails.
10. The system records payment results and prevents duplicate
    payment notifications from creating duplicate orders or tickets.

### 3.2 Non-Functional Requirements

**Performance**
- Event listings should load quickly under normal traffic.
- Seat availability and booking requests should receive timely
  responses, including during popular sales.
- The system should monitor response times and errors.

**Correctness and consistency**
- A seat must never be sold to two customers.
- An order must not be marked as paid without verified payment.
- Expired seat holds must not be treated as valid reservations.
- Database transactions and constraints must protect booking operations.

**Fairness**
- A virtual waiting room should manage demand during exceptionally
  popular sales.
- Requests should be admitted according to a consistent queue policy.
- Rate limits should reduce abuse without unfairly favoring customers
  who send excessive requests.

**Availability and reliability**
- Multiple application servers should allow the service to continue
  operating if one server fails.
- The database should have backups and a tested recovery procedure.
- Failed background jobs should be retried safely.

**Security**
- Private account and ticket information must require authentication.
- Users must only access orders and tickets they are authorized to view.
- Payment details should be handled by a trusted payment provider.
- Inputs must be validated, and sensitive information must be protected.

**Scalability**
- The system should scale its application servers to handle demand.
- Event browsing should be separated from critical seat-booking writes.

## 4. Traffic and Capacity Estimates

### 4.1 Given Assumptions

- Registered users: 2,000,000.
- Normal daily visitors: 50,000.
- Average pages viewed per visitor: 10.
- Normal daily ticket sales: 5,000.
- Popular sale demand: 200,000 people in 10 minutes.
- Seats available during the popular sale: 20,000.

### 4.2 Normal Traffic

Daily page views:

50,000 visitors × 10 pages = 500,000 page views per day.

Average page-view request rate:

500,000 ÷ 86,400 seconds ≈ 5.79 requests per second.

Therefore, normal traffic averages approximately 6 page views
per second, assuming one page-view request per page.

Normal ticket sales:

5,000 tickets ÷ 86,400 seconds ≈ 0.058 tickets per second.

This is approximately 208 tickets per hour on average.

These averages do not represent peak traffic. Actual traffic may
be higher during busy periods.

### 4.3 Popular Sale Traffic

The popular sale attracts 200,000 purchase attempts within
10 minutes.

10 minutes = 600 seconds.

Average purchase attempts:

200,000 ÷ 600 ≈ 333.33 attempts per second.

The system should therefore plan for at least this average
purchase-attempt rate and allow additional capacity for bursts.

The 333 attempts per second figure represents purchase attempts,
not total API requests. Each customer may generate multiple
requests while browsing, selecting seats, holding seats, and paying.

### 4.4 Supply and Demand

Available seats: 20,000.

Potential buyers: 200,000.

Demand-to-seat ratio:

200,000 ÷ 20,000 = 10 potential buyers per seat.

Assuming each person attempts to buy one seat, no more than
20,000 people can obtain a seat.

The system must reject unsuccessful booking attempts clearly
and must never oversell the available seats.

### 4.5 Capacity Implications

- Cache event details and other frequently read information.
- Use a waiting room to control admission during popular sales.
- Scale application servers horizontally.
- Use the primary database to coordinate seat reservations.
- Keep payment processing outside long-running database transactions.
- Monitor request rates, response times, database contention,
  booking failures, and payment failures.

Peak API traffic may exceed the purchase-attempt rate because
each customer can make several API requests. Further capacity
planning would require assumptions about the number of requests
per customer and the concentration of requests during the sale.

## 5. API Design

TicketHub exposes a REST API using JSON for request and response
bodies. Protected endpoints require authentication.

### 5.1 Browse Events

GET /api/events

Returns a paginated list of published events.

Example response:

HTTP 200 OK

{
  "events": [
    {
      "id": 42,
      "name": "Summer Music Festival",
      "venue": "Main Arena",
      "startsAt": "2026-12-20T17:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20
}

### 5.2 View Event Seats

GET /api/events/{eventId}/seats

Returns the seats for an event and their current availability.

Example response:

HTTP 200 OK

{
  "eventId": 42,
  "seats": [
    {
      "id": 120,
      "label": "A12",
      "status": "AVAILABLE"
    },
    {
      "id": 121,
      "label": "A13",
      "status": "SOLD"
    }
  ]
}

Seat availability is informational. The booking endpoint must
recheck availability before creating a reservation.

### 5.3 Hold Seats

POST /api/events/{eventId}/holds

Requires authentication.

Example request:

{
  "seatIds": [120],
  "idempotencyKey": "unique-request-key-123"
}

If the requested seats are available, the system creates a pending
order and temporarily holds the seats.

Example success response:

HTTP 201 Created

{
  "orderId": 501,
  "status": "PENDING_PAYMENT",
  "seatIds": [120],
  "holdExpiresAt": "2026-10-14T18:10:00Z"
}

Possible errors:

- 400 Bad Request: invalid input.
- 401 Unauthorized: the user is not authenticated.
- 404 Not Found: the event or seat does not exist.
- 409 Conflict: a requested seat is unavailable.
- 429 Too Many Requests: the client has exceeded its rate limit.

The reservation is created within a database transaction so that
concurrent requests cannot reserve the same available seat.

### 5.4 Initiate Payment

POST /api/orders/{orderId}/payments

Requires authentication and ownership of the order.

Example request:

{
  "paymentMethod": "PROVIDER_CHECKOUT",
  "idempotencyKey": "payment-request-key-501"
}

The backend verifies that the order belongs to the user and that
the seat hold is still valid before initiating payment.

Example response:

HTTP 202 Accepted

{
  "orderId": 501,
  "paymentStatus": "PENDING",
  "message": "Payment initiated"
}

The payment provider processes the payment. The order is not
confirmed merely because payment was initiated.

### 5.5 Receive Payment Notifications

POST /api/payments/webhook

This endpoint receives payment status notifications from the
external payment provider.

The backend verifies the provider's signature and payment reference,
checks the amount and currency, and processes each notification
idempotently.

A valid notification is acknowledged with HTTP 200 OK.

Repeated notifications must not create duplicate tickets or
confirm the same payment more than once.

### 5.6 View Purchased Tickets

GET /api/me/tickets

Requires authentication.

Returns tickets belonging to the authenticated user.

Example response:

HTTP 200 OK

{
  "tickets": [
    {
      "ticketId": 9001,
      "eventId": 42,
      "eventName": "Summer Music Festival",
      "seatLabel": "A12",
      "status": "CONFIRMED"
    }
  ]
}

The backend derives the user identity from the authenticated
session or access token. It must not trust a user ID supplied
by the client to determine ticket ownership.

### 5.7 Release a Seat Hold

DELETE /api/orders/{orderId}/hold

Requires authentication and ownership of the order.

If the order is still pending and the hold can safely be released,
the backend releases its seats.

Example success response:

HTTP 204 No Content

If the order has already been paid, the endpoint must not release
the purchased seats.

### 5.8 Common Error Handling

The API uses appropriate HTTP status codes:

- 200 OK: request succeeded.
- 201 Created: a reservation was created.
- 202 Accepted: an asynchronous operation was accepted.
- 204 No Content: an operation succeeded without a response body.
- 400 Bad Request: invalid request data.
- 401 Unauthorized: authentication is required or invalid.
- 403 Forbidden: the user is not authorized to perform the action.
- 404 Not Found: the requested resource does not exist.
- 409 Conflict: the requested seat is no longer available.
- 429 Too Many Requests: the client exceeded its rate limit.
- 500 Internal Server Error: an unexpected server error occurred.
- 503 Service Unavailable: the service cannot currently accept
  the request.

Error responses should use a consistent JSON structure containing
an error code and a clear, non-sensitive message.

## 6. Data Model

TicketHub uses a relational database such as PostgreSQL because
orders, payments, and seat reservations require reliable
transactions and relationships.

### 6.1 Tables

#### Users

Stores registered customer accounts.

- user_id: primary key.
- full_name: customer's name.
- email: unique email address.
- password_hash: securely stored password hash.
- created_at: account creation timestamp.

#### Events

Stores published events.

- event_id: primary key.
- title: event name.
- venue: event location.
- starts_at: event start timestamp.
- status: publication or event status.
- created_at: record creation timestamp.

#### Seats

Stores individual seats belonging to an event.

- seat_id: primary key.
- event_id: foreign key referencing events.
- seat_label: seat identifier, such as A12.
- price: ticket price.
- status: AVAILABLE, HELD, or SOLD.
- hold_expires_at: expiry time for a temporary hold.
- held_by_order_id: nullable reference to the order holding
  the seat.

Constraint:

UNIQUE (event_id, seat_label)

This ensures that a seat label is unique within its event.

#### Orders

Stores a customer's order.

- order_id: primary key.
- user_id: foreign key referencing users.
- event_id: foreign key referencing events.
- status: PENDING_PAYMENT, PAID, EXPIRED, or CANCELLED.
- total_amount: total order amount.
- created_at: order creation timestamp.
- hold_expires_at: expiry time for the reservation.

#### Order Items

Connects orders to the seats included in each order.

- order_item_id: primary key.
- order_id: foreign key referencing orders.
- seat_id: foreign key referencing seats.
- price_at_purchase: price recorded for the order item.

Constraint:

UNIQUE (order_id, seat_id)

This prevents the same seat from being added to an order twice.
Different historical orders may reference the same seat if an
earlier reservation expired or was cancelled. Only one order may
successfully own the seat at a time.

#### Payments

Records payment attempts and their results.

- payment_id: primary key.
- order_id: foreign key referencing orders.
- provider_reference: unique payment-provider transaction reference.
- amount: amount requested or paid.
- status: PENDING, SUCCEEDED, or FAILED.
- created_at: payment creation timestamp.

A payment-provider reference must be unique to prevent the same
provider transaction from being recorded more than once.

### 6.2 Relationships

- One user can create many orders.
- One event can contain many seats.
- One event can have many orders.
- One order belongs to one user and one event.
- One order can contain many order items.
- Each order item references one seat.
- One order can have multiple payment attempts.

The database uses primary keys to identify records and foreign
keys to maintain referential integrity.

Seat availability and ownership are maintained in the database,
rather than relying on the browser's displayed seat status.

## 7. Preventing Double-Booking

TicketHub must ensure that two customers can never successfully
purchase the same seat.

The system uses database transactions, row-level locking, and
controlled seat-state transitions to enforce this guarantee.

### 7.1 Seat Reservation Process

When a customer requests seats:

1. The backend authenticates the customer and validates the request.
2. The backend starts a database transaction.
3. The backend locks the requested seat rows using
   SELECT ... FOR UPDATE.
4. The backend checks the current state of every requested seat.
5. If any requested seat is unavailable, the transaction does not
   create a successful reservation.
6. If all requested seats are available, the backend creates a
   pending order and its order items.
7. The backend changes the requested seats from AVAILABLE to HELD
   and records the hold expiry time.
8. The backend commits the transaction.
9. The customer receives the reservation details and can proceed
   to payment.

If the transaction fails, its database changes are rolled back.

When multiple customers request the same seat, the database
coordinates access to the locked row. A request that obtains
the lock later must recheck the seat state and cannot hold a seat
that is already reserved or sold.

### 7.2 Payment Confirmation

Payment processing takes place through an external payment provider.

The backend does not hold database locks while waiting for the
customer or payment provider to complete an external operation.

When a verified payment notification arrives, the backend starts
a new database transaction and checks the order, payment reference,
seat ownership, and reservation state.

If the payment is valid and the reservation is still eligible for
confirmation, the backend records the successful payment, marks
the order as PAID, changes the seats to SOLD, and commits the
transaction.

If payment confirmation arrives after the hold has expired or
the reservation is no longer valid, the backend must not sell
the seat again to that customer. It must follow a defined recovery
process, such as refunding or voiding the payment where supported.

### 7.3 Handling Expired Holds

A scheduled worker periodically finds expired reservations.

For each reservation, it locks the relevant rows, verifies that
the hold has expired and that the order is still pending, then
marks the order as EXPIRED and releases the seats.

The expiry worker and payment-confirmation handler must coordinate
their updates through transactions and state checks.

A delayed expiry job must never release a seat that has already
been sold.

### 7.4 Database Safeguards

- Use primary keys and foreign keys to protect record integrity.
- Use UNIQUE (event_id, seat_label) to prevent duplicate seat
  definitions within an event.
- Use UNIQUE (order_id, seat_id) to prevent duplicate seat entries
  within an order.
- Make payment-provider references unique.
- Change seat status through controlled transactional operations.
- Use idempotency keys to recognize repeated reservation and
  payment requests.

### 7.5 Result

The database is the source of truth for seat availability.

The frontend may display an outdated seat status, but the backend
must always verify the current database state before granting
a reservation.

This ensures that concurrent requests cannot successfully sell
the same seat twice.

## 8. High-Level Architecture

### 8.1 Architecture Diagram

```mermaid
flowchart TD
    U[Customers] --> CDN[CDN and WAF]
    CDN --> W[Virtual Waiting Room and Rate Limiter]
    W --> LB[Load Balancer]

    LB --> A1[Application Server 1]
    LB --> A2[Application Server 2]
    LB --> A3[Application Server 3]

    A1 --> C[Redis Cache]
    A2 --> C
    A3 --> C

    A1 --> DB[(PostgreSQL Primary)]
    A2 --> DB
    A3 --> DB

    DB --> R[(Read Replica)]

    A1 --> Q[Background Job Queue]
    A2 --> Q
    A3 --> Q

    Q --> BW[Background Workers]
    BW --> E[Email and Ticket Notifications]

    A1 --> P[External Payment Provider]
    A2 --> P
    P --> A1

    DB --> MON[Monitoring and Alerts]
    A1 --> MON
    A2 --> MON
    A3 --> MON