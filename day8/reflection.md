# Day 8 Reflection

## 1. Most Difficult Concept

The most difficult concept for me was scope. While building the API client for Project 2, I thought a method was missing from `api.js`, because `handleSubmit()` could not use `removeEmptyMessage()`. I looked at my code again and saw that I had written `removeEmptyMessage()` inside `renderNotes()`, so it only existed there. I moved it out so it sat at the top level of the file, next to the other functions. I now understand that a function declared inside another function can only be called from inside it. When something is "not defined", I check where each function starts and ends before I assume it is missing.

## 2. Improving My Capstone

The feedback said my design document had no trade-offs, an unclosed diagram and a structure that hid its best sections. I am fixing it by closing the diagram, explaining each component, adding trade-offs such as correctness versus throughput, and putting a short summary at the top. I also added a tickets table with a unique `seat_id` as a second protection against double-booking. I will check my work by listing every heading and confirming all code blocks are closed.

## 3. What I Will Learn Next

My next goal is to turn my own API design into a working backend. I will build one endpoint with Node.js and Express, connect it to a real database, and test it. After that I want to practise database transactions by sending two requests for the same seat at the same time, to see how a row lock makes them take turns. I expect concurrency to be hardest, because the result depends on timing.