# TicketHub: Event Ticketing System Design

## Summary

TicketHub sells seats for events to 2 million registered users. A normal day is
small (about 6 page views and 0.06 sales per second), but a popular sale brings
200,000 people for 20,000 seats in 10 minutes (about 333 purchase attempts per
second and 10 buyers per seat). The design is built for that spike and for
never selling a seat twice.

- **API:** REST endpoints to browse events, view seats, hold seats
  (`POST /api/events/{eventId}/holds`), pay (`POST /api/orders/{orderId}/payments`
  plus a payment webhook), view tickets and release a hold.
- **Data model:** users, events, seats, orders, order items, payments and tickets
  in PostgreSQL.
- **Preventing double-booking:** a seat hold is a database transaction that locks
  the seat rows with `SELECT ... FOR UPDATE`, rechecks their state and changes
  them from AVAILABLE to HELD. Payment happens outside the transaction, and a
  payment webhook confirms the seats in a second transaction. A unique constraint
  on tickets (seat_id) is the last line of defence.
- **Architecture:** CDN and firewall, a waiting room and rate limiter, a load
  balancer, stateless application servers, a Redis cache, a PostgreSQL primary
  with a read replica, a job queue with workers, an external payment provider and
  monitoring.
- **Main trade-offs:** fairness versus speed (waiting room), speed versus freshness
  (cached seat availability) and correctness versus throughput (row locks).

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

### Non-Goals

- Building a social network for event attendees.
- Organizing or managing the concerts themselves.

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

**Correctness and consistency**
- A seat must never be sold to two customers.
- An order must not be marked as paid without verified payment.
- Expired seat holds must not be treated as valid reservations.

**Fairness**
- A virtual waiting room should manage demand during exceptionally
  popular sales.
- Requests should be admitted according to a consistent queue policy.

**Availability and reliability**
- Multiple application servers should allow the service to continue
  operating if one server fails.
- The database should have backups and a tested recovery procedure.

**Security**
- Private account and ticket information must require authentication.
- Users must only access orders and tickets they are authorized to view.

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


### 4.3 Popular Sale Traffic

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

### 4.6 Normal Day Compared with the Popular Sale

To compare total traffic, I assume each buyer makes about 10 requests during
the sale (the event page, several refreshes of the seat map, one or more seat
holds and the payment steps) and about 3 seat-hold attempts.

| Item | Normal day | Popular sale |
|------|------------|--------------|
| All requests | about 5.8 per second on average, about 29 at a 5x peak | 200,000 x 10 = 2,000,000 in 600 s, about 3,333 per second on average, about 16,700 at a 5x peak |
| Seat-hold attempts | not applicable | 200,000 x 3 = 600,000 in 600 s, about 1,000 per second |
| Successful purchases | about 0.058 per second | at most 20,000 in 600 s, about 33 per second |

The popular sale is therefore roughly 575 times busier than a normal day, but
only for about 10 minutes. Most of that traffic is reading (browsing and
refreshing seats), while the writes that matter (holding and buying seats) are
concentrated on the same 20,000 rows. About 9 out of every 10 buyers will not
get a seat, so unsuccessful attempts must fail quickly and clearly.

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

During a popular sale, requests must include a short-lived admission token issued by the waiting room, otherwise the API returns 403 Forbidden.

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

#### Tickets

Stores a ticket for each seat that has been sold.

- ticket_id: primary key.
- order_item_id: foreign key referencing order items.
- seat_id: foreign key referencing seats.
- created_at: ticket creation timestamp.

Constraint:

UNIQUE (seat_id)

A seat can only ever have one ticket. A ticket is created only when a payment
is confirmed, in the same transaction that marks the seat SOLD. Even if there
were a bug in the application code, the database would refuse to create a second
ticket for the same seat.

### 6.2 Relationships

- One user can create many orders.
- One event can contain many seats.
- One event can have many orders.
- One order belongs to one user and one event.
- One order can contain many order items.
- Each order item references one seat.
- One order can have multiple payment attempts.
- Each paid order item has one ticket, and each seat has at most one ticket.

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
   Seats are locked in ascending seat_id order, so two requests for overlapping seats cannot deadlock.
4. The backend checks the current state of every requested seat.
A seat that is HELD but whose hold_expires_at is in the past is treated as available.
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
 - Use UNIQUE (seat_id) on tickets as a last line of defence against selling a seat twice.

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


The diagram follows a request from the customer to the database. Browsing is
separated from seat booking: public pages, cached data and the read replica
serve reads, while seat holds and payment confirmations are written only to the
PostgreSQL primary.

### 8.2 What Each Component Does

- **Customers (browser or mobile app)** use the website and send requests, which
  gives people a way to use the system.
- **CDN and WAF** serve static files and public event pages from servers near the
  customer, and the web application firewall blocks malicious traffic, which keeps
  most browsing traffic and attacks away from the application servers.
- **Virtual waiting room and rate limiter** admit customers to a popular sale at a
  controlled rate, in the order they arrived, and slow down clients that send too
  many requests, which stops the servers and database from being overwhelmed and
  keeps the sale fair.
- **Load balancer** spreads requests across the application servers and stops
  sending requests to a server that fails its health check, so one failed server
  does not stop the service.
- **Application servers (1 to 3, and more when needed)** run the API logic. They are
  stateless, so extra servers can be added before a popular sale and removed
  afterwards.
- **Redis cache** keeps event details and a one-to-two-second copy of seat
  availability in memory, so thousands of customers can look at seats without every
  request reaching the database.
- **PostgreSQL primary** is the single source of truth for seats, orders and
  payments, and the only place where seats are held and sold, so transactions and
  row locks can prevent double-booking.
- **Read replica** is a live copy of the primary that answers browsing queries,
  which keeps read traffic away from the primary and gives a spare copy if the
  primary fails.
- **Background job queue and workers** run slow work outside the customer's request:
  sending emails and ticket notifications, releasing expired holds and retrying
  failed jobs safely.
- **External payment provider** takes the payment and handles sensitive payment
  details, so TicketHub never stores them, and it reports the result by webhook.
- **Monitoring and alerts** track response times, error rates, database contention,
  queue length and payment failures, so engineers see a problem before customers do.

### 8.3 Flow of a Popular Sale

1. Before the sale, extra application servers are started and the waiting room is
   switched on for the event.
2. When the sale opens, customers enter the waiting room and are admitted at a
   steady rate, in the order they arrived. An admitted customer receives a
   short-lived admission token.
3. The customer views the event and the seat map. These reads come from the CDN,
   the Redis cache and the read replica, and are informational.
4. The customer chooses seats and sends `POST /api/events/{eventId}/holds`. The
   application server checks the token, starts a transaction on the primary
   database, locks the seat rows and checks them (section 7.1).
5. If a seat is taken, the customer gets `409 Conflict` and chooses again. If the
   seats are free, they are held and the customer has a limited time to pay.
6. The customer pays through the payment provider. No database lock is held while
   the customer or the provider is working.
7. The provider sends a webhook. The server verifies it and, in a new transaction,
   marks the order PAID and the seats SOLD (section 7.2).
8. A worker sends the ticket notification. If the customer never pays, the hold
   expires and a worker releases the seats (section 7.3).

### 8.4 What Breaks First and How the Design Survives the Sale

**What breaks first?** The PostgreSQL primary, because every seat hold and
purchase for the popular event writes to the same small group of rows, and
customers who want the same seats wait for each other's locks. After that, the
application servers' CPU, and then the payment provider's limits.

**How the design survives**
- The waiting room limits how many customers reach the servers and the database
  at the same moment.
- The CDN, the cache and the read replica take most of the read traffic, so the
  primary is kept for seat holds and payments.
- A hold is a short transaction, so each lock is held for a very short time, and
  unsuccessful attempts end quickly with a 409.
- Payment is outside the transaction, so a slow payment never holds a lock.
- Rate limits stop bots and repeated refreshing.
- Application servers are added before the sale, because the sale time is known.

### 8.5 Trade-offs

1. **Fairness versus speed.** The waiting room makes some customers wait, but it
   protects the system from being overwhelmed and keeps the sale fair. Without it,
   the system could fail and nobody would be able to buy.
2. **Speed versus freshness.** Seat availability is cached for a short time, so a
   customer may click a seat that was just taken and get a 409. This is acceptable
   because the final decision always comes from the primary database, so
   correctness is never at risk, and the database is protected from thousands of
   seat-map refreshes.
3. **Correctness versus throughput.** Row locks make sure only one customer can
   hold a seat, but customers who want the same seat have to wait for each other.
   We accept this because selling a seat twice is far worse than a short wait, and
   we keep the transactions very short.
4. **Holding seats versus selling more seats.** A hold gives customers time to pay,
   but it keeps the seat away from other customers while the holder decides. A
   short hold time and a worker that quickly releases expired holds keep this cost
   low.
5. **Simplicity versus scalability.** We use one primary database and no
   sharding. This is simpler to build and to keep correct, and the waiting room
   limits the load on it. If one popular event ever became too much for a single
   primary, the data could be split by event.

### 8.6 Single Points of Failure

- **Application servers:** several identical servers behind the load balancer, which
  skips unhealthy ones.
- **Load balancer:** a redundant pair or a managed cloud load balancer.
- **Primary database:** the read replica can be promoted to primary (failover), and
  backups are stored separately and restored in tests.
- **Cache and waiting room:** if Redis fails, requests fall back to the database
  and the waiting room can be rebuilt, with a short pause in the sale.
- **Queue and workers:** jobs wait safely in the queue and extra workers can be
  started.
- **Payment provider:** payment requests use timeouts and idempotency keys, and
  orders stay in a pending state until the result is known.