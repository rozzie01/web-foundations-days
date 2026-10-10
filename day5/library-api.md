# Library API Design

A REST API for a library's **books** resource. The resource is named with a
plural noun (`/books`), the HTTP method says what to do, and a specific book
is addressed by its id (`/books/42`).

## Endpoints

### 1. List all books
- **Method and path:** `GET /books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book
- **Method and path:** `GET /books/42`
- **Description:** Returns the book with id 42.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book
- **Method and path:** `POST /books`
- **Description:** Adds a new book to the library.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958
  }
```
- **Success status:** `201 Created`

### 4. Update a book
- **Method and path:** `PATCH /books/42`
- **Description:** Changes only the fields sent for book 42.
- **Example request body:**
```json
  {
    "year": 1959
  }
```
- **Success status:** `200 OK`

### 5. Delete a book
- **Method and path:** `DELETE /books/42`
- **Description:** Removes book 42 from the library.
- **Request body:** none
- **Success status:** `204 No Content`

### 6. List books by an author
- **Method and path:** `GET /books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the given author, using
  a query parameter after the `?`.
- **Request body:** none
- **Success status:** `200 OK`

## Error codes

### 400 Bad Request
The request itself is invalid.
- **Example:** `POST /books` with an empty title, or with the `author` field
  missing.

### 404 Not Found
The book or URL does not exist.
- **Example:** `GET /books/9999` when no book has the id 9999.