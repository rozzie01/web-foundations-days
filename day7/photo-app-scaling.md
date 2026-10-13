# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed
of photos from people they follow. This plan estimates the load and designs
a system that can handle it.

## 1. Assumptions

- 10,000,000 registered users
- 10% are active each day, so there are **1,000,000 daily active users (DAU)**
- Each active user uploads 1 photo per day: **1,000,000 uploads per day**
- Each active user views 50 feed pages per day: **50,000,000 feed views per day**
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail
- For easy maths, 1 day is rounded to 100,000 seconds
- Peak traffic is 5 times the average

## 2. Estimates

### Uploads per second
- Average: 1,000,000 uploads ÷ 100,000 seconds = **10 uploads per second**
- Peak (5x): **50 uploads per second**

### Feed views per second
- Average: 50,000,000 views ÷ 100,000 seconds = **500 feed views per second**
- Peak (5x): **2,500 feed views per second**

### Storage per year
- Original photos: 1,000,000 x 2 MB = 2 TB per day
- Thumbnails: 1,000,000 x 50 KB = 50 GB per day
- Total: about 2.05 TB per day
- Per year: 2.05 TB x 365 = **about 750 TB per year**
  (about 730 TB of originals and 18 TB of thumbnails)

### Upload bandwidth
- Average: 10 uploads per second x 2 MB = 20 MB per second
- Peak: 50 uploads per second x 2 MB = 100 MB per second

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 500 feed views per second but only
10 uploads per second, about 50 reads for every write.

What this means for the design:
- Cache feed results so most reads never reach the database. If 90% of reads
  are cache hits, the database sees only about 250 reads per second at peak
  instead of 2,500.
- Serve photos and thumbnails from a CDN close to the user.
- Use read replicas so reads are spread across several database copies.
- Writes are rare, but each upload is large (2 MB), so uploads need object
  storage and background processing for thumbnails.

  ## 4. Where photos are stored

Photos should not be stored inside the database. They go in **object
storage** (such as Amazon S3), and the database stores only a link (a storage
key) to each file.

Reasons:
- **Size.** A database row is about 500 bytes, while a photo is 2 MB, about
  4,000 times bigger. 750 TB of photos per year would swamp a database.
- **Cost.** Object storage is much cheaper per terabyte than database storage.
- **Speed.** Big files slow down the database, its backups and its replicas,
  which must copy everything.
- **Fit.** Databases are built for small structured records and queries.
  Object storage is built for large files, scales almost without limit and
  works directly with a CDN.

  ## 5. Architecture diagram

```
                         ┌─────────┐
          ┌─────────────>│   DNS   │   snapshare.com -> IP addresses
          │              └─────────┘
 ┌────────┴──────┐  photos + static files  ┌──────────────────────────┐
 │ Browser /     │ <─────────────────────> │ CDN (edge servers)       │
 │ mobile app    │                         │ miss -> Object storage   │
 └────────┬──────┘                         └──────────────────────────┘
          │ API calls (HTTPS, JSON)
          v
  ┌───────────────┐
  │ Load balancer │
  └───────┬───────┘
          ├──────────┬──────────┐
          v          v          v
      ┌───────┐  ┌───────┐  ┌───────┐
      │ App 1 │  │ App 2 │  │ App 3 │   (stateless, identical)
      └───┬───┘  └───┬───┘  └───┬───┘
          └──────────┼──────────┘
                     │  every app server uses all of these
      ┌──────────────┼──────────────────┬───────────────────┐
      v              v                  v                   v
 ┌─────────┐  ┌─────────────┐  ┌─────────────────┐  ┌───────────────┐
 │  Cache  │  │  Primary DB │  │ Object storage  │  │ Message queue │
 │ (Redis) │  │ (metadata)  │  │ (photos+thumbs) │  │    (jobs)     │
 └─────────┘  └──────┬──────┘  └─────────────────┘  └───────┬───────┘
                     │ copies                               │ jobs
                     v                                      v
              ┌──────────────┐                       ┌────────────┐
              │ Read replica │                       │   Worker   │
              │ (feed reads) │                       │(thumbnails)│
              └──────────────┘                       └────────────┘
```

How to read it:
- Writes (new photo records) go to the primary database, which copies its
  data to the read replica. Feed reads use the cache first, then the replica.
- The worker takes a job from the queue, reads the original photo from object
  storage, saves a thumbnail back to object storage and marks the photo
  "ready" in the database.
- On a cache miss, the CDN fetches the photo from object storage.

## 6. What each component does

- **DNS** turns the name snapshare.com into the IP address of the system so
  users do not need to know it.
- **CDN** keeps copies of photos, thumbnails and static files on servers near
  the user, so pages load faster and our own servers do less work.
- **Load balancer** spreads requests across the app servers and skips any
  that fail health checks, so no single server is overloaded or a single
  point of failure.
- **App servers** run the API code (login, upload, feed) and, because they
  are stateless, we can add more of them when traffic grows.
- **Cache (Redis)** keeps recently built feeds in memory so repeated reads are
  answered in about 1 ms without touching the database.
- **Primary database** stores the metadata (users, who follows whom, photo
  records and links) safely and permanently, and it is the only place that
  accepts writes.
- **Read replica** is a copy of the primary that answers feed reads, so the
  primary is free to handle writes.
- **Object storage** holds the large photo files cheaply and durably, so the
  database stays small and fast.
- **Message queue** holds thumbnail jobs so uploads can finish immediately and
  a sudden burst of uploads waits in line instead of overloading the system.
- **Worker** takes jobs from the queue and creates the thumbnails in the
  background so the user never waits for image processing.

  ## 7. Upload flow

1. The user picks a photo and taps Upload. The app sends `POST /photos` over
   HTTPS with the photo and the user's login token.
2. DNS finds the system and the **load balancer** sends the request to a
   healthy **app server**.
3. The app server checks the token to identify the user and validates the
   file (allowed type and maximum size).
4. The app server saves the original photo in **object storage** and gets
   back a storage key, for example `photos/original/9001.jpg`.
5. The app server inserts a row in the **primary database** with the photo
   id, the user id, the storage key and the status "processing".
6. The app server adds a job such as `{ photo_id: 9001 }` to the **queue**.
7. The app server replies `201 Created` straight away. The user does not wait
   for the thumbnail.
8. A **worker** takes the job from the queue, reads the original from object
   storage, creates a 50 KB thumbnail and saves it, for example as
   `photos/thumb/9001.jpg`.
9. The worker updates the database row with the thumbnail key and the status
   "ready".
10. Cached data that is now out of date (such as the uploader's own page) is
    removed from the cache. Followers' cached feeds update when their short
    expiry time (TTL) runs out.
11. When followers scroll their feed, the thumbnail is served by the **CDN**.
    The first request fetches it from object storage, and later requests come
    from the nearby edge server.

If a worker crashes, the job stays in the queue and is retried. The app keeps
working, and the photo shows a placeholder until its thumbnail is ready.

## 8. Trade-offs

1. **Speed versus freshness (caching).** Caching feeds makes them load much
   faster and protects the database, but a cached feed can be stale. With a
   60-second TTL, a follower might not see a new photo for up to a minute.
   This is acceptable for a photo feed, but it would not be for a bank balance.
2. **Fast uploads versus instant thumbnails (queue).** Creating thumbnails in
   the background lets the upload reply right away, but the thumbnail is not
   available for a few seconds, so the app must show a placeholder meanwhile.
3. **Read replicas and consistency.** Replicas let us serve many more reads,
   but copying takes a moment (replication lag), so a replica can briefly show
   old data. All copies eventually agree (eventual consistency).
4. **Cost versus reliability.** Storing about 750 TB per year is expensive,
   and keeping extra copies in other regions makes photos safer but costs more.
   Older, rarely viewed photos could move to cheaper storage.
5. **Simplicity versus scalability.** At this size, three or so app servers,
   one primary and a replica are enough, so we do not shard the database or
   split the app into microservices yet. Extra complexity would cost more than
   it gains.

   