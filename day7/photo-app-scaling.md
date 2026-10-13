# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed
of photos from people they follow.

## 1. Assumptions

- 10,000,000 registered users
- 10% are active each day, so **1,000,000 daily active users (DAU)**
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail
- For easy maths, 1 day is rounded to 100,000 seconds
- Peak traffic is about 5 times the average

## 2. Estimates

### Uploads (writes)
- 1,000,000 users x 1 photo = 1,000,000 uploads per day
- 1,000,000 / 100,000 = **10 uploads per second** on average
- Peak: 10 x 5 = **50 uploads per second**

### Feed views (reads)
- 1,000,000 users x 50 feed pages = 50,000,000 feed views per day
- 50,000,000 / 100,000 = **500 feed views per second** on average
- Peak: 500 x 5 = **2,500 feed views per second**

### Storage per year
- Original photos: 1,000,000 x 2 MB = 2 TB per day
- Thumbnails: 1,000,000 x 50 KB = 50 GB per day
- Total: about 2.05 TB per day
- Per year: 2.05 TB x 365 = about **748 TB per year**

### Extra numbers
- Upload bandwidth: 10 uploads/s x 2 MB = about 20 MB/s (about 100 MB/s at peak)
- Database records: about 500 bytes per photo x 1,000,000 per day = 500 MB
  per day, or about **180 GB per year**

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**: 500 feed views per second against 10 uploads per
second is about 50 reads for every write.

What this means for the design:
- Caching will give the biggest improvement, because the same feeds and
  photos are requested again and again.
- Read replicas can handle most database traffic.
- A CDN should serve photos and thumbnails so most reads never reach our
  servers.
- Uploads are rare, so slow work such as making thumbnails can happen in the
  background through a queue.

## 4. Why photos are not stored in the database

The database only needs about 180 GB per year for photo records, but the
image files need about 748 TB per year. Storing images inside the database
would make it thousands of times bigger, which makes backups, replication and
recovery very slow and expensive, and fills the cache with huge files. Photos
also cannot be delivered through a CDN easily from a database.

Instead, photos go in **object storage** (such as Amazon S3), which stores
large files cheaply and durably and scales almost without limit. The database
stores only a **link (URL or key)** to each file.

## 5. Architecture diagram
```
                      ┌─────────┐
        ┌────────────>│   DNS   │   (snapshare.com -> IP addresses)
        │             └─────────┘
 ┌──────┴────────┐    static files and photos   ┌─────────────────────┐
 │ Browser /     │ ───────────────────────────> │ CDN                 │
 │ mobile app    │                              │ (site files, photos,│
 └──────┬────────┘                              │  thumbnails)        │
        │ API calls (HTTPS, JSON)               └──────────┬──────────┘
        v                                                  │ cache miss
 ┌───────────────┐                                         v
 │ Load balancer │                              ┌─────────────────────┐
 └──────┬────────┘                              │ Object storage      │
   ┌────┴─────┬───────────┐                     │ (original photos +  │
   v          v           v                     │  thumbnails)        │
┌───────┐ ┌───────┐ ┌───────┐   ┌──────────┐    └──────────▲──────────┘
│ App 1 │ │ App 2 │ │ App 3 │──>│  Cache   │               │ save / read
└──┬────┘ └──┬────┘ └──┬────┘   │ (Redis)  │               │
   │ writes  │ reads   │ jobs   └──────────┘      ┌────────┴────────┐
   v         v         v                          │     Worker      │
┌─────────┐ ┌─────────┐ ┌─────────┐ take job     │ (makes          │
│ Primary │>│ Read    │ │  Queue  │─────────────>│  thumbnails)    │
│   DB    │ │ replica │ │         │              └─────────────────┘
└─────────┘ └─────────┘ └─────────┘
```

## 6. What each component does

- **DNS** turns the name snapshare.com into the IP address of our servers, so
  users do not need to remember numbers.
- **CDN** keeps copies of the site files, photos and thumbnails on servers
  near users, which reduces delay and takes most read traffic away from our
  own servers.
- **Load balancer** spreads requests across several app servers and stops
  sending traffic to any server that fails its health check.
- **App servers** run the API code (login, upload, feed). They are stateless,
  so we can add more of them when traffic grows.
- **Cache (Redis)** keeps recently used feeds and photo records in memory, so
  repeated reads are answered in about 1 ms and the database is protected.
- **Primary database** stores users, follows and photo records, and is the
  only place that accepts writes.
- **Read replica** is a copy of the primary that answers read queries, which
  spreads the load and gives a backup copy if the primary fails.
- **Object storage** stores the large photo and thumbnail files cheaply and
  durably, because the database is the wrong place for them.
- **Queue** holds background jobs, so the user gets a fast reply and spikes of
  uploads wait in line instead of overloading the system.
- **Worker** takes jobs from the queue and creates thumbnails, so the slow
  image processing does not delay the upload response.

## 7. Upload flow, step by step

1. The user chooses a photo and the app sends it to `POST /photos` over HTTPS,
   with the user's token in the Authorization header.
2. The load balancer sends the request to a healthy app server.
3. The app server checks the token, then validates the file (allowed type,
   maximum size).
4. The app server saves the original photo in object storage and gets back its
   storage key.
5. The app server writes a new photo row to the primary database (owner,
   storage key, date, thumbnail status "pending").
6. The app server adds a job "create thumbnail for photo 123" to the queue.
7. The app server clears the uploader's cached photo list, so the next read
   fetches fresh data.
8. The app server replies immediately with `201 Created`. The user does not
   wait for the thumbnail.
9. A worker takes the job from the queue, downloads the original, creates the
   50 KB thumbnail, saves it in object storage and updates the database row
   to "ready".
10. The primary copies the change to the read replica a few milliseconds
    later. When followers load their feeds, the thumbnail comes from the CDN.

## 8. Trade-offs

1. **Speed versus freshness.** Caching feeds and using read replicas makes
   reads fast, but a follower may see a new photo a few seconds late. This is
   acceptable for a photo feed. It would not be acceptable for something like
   a bank balance.
2. **Fast uploads versus instant thumbnails.** Making thumbnails in a queue
   keeps the upload response quick, but the thumbnail is not ready for a short
   time. The app can show a placeholder until it is ready.
3. **Simplicity versus scalability.** We use several stateless app servers
   with a cache and a replica, but we do not use sharding or microservices.
   At 10 million users this is enough, and a simpler system is easier to run
   and debug.
4. **Cost versus reliability.** Extra app servers, a replica and a CDN cost
   money, but they remove single points of failure and keep the app running
   when one part fails.

## 9. Avoiding single points of failure

- Several app servers behind a load balancer, so one crash does not stop the
  service.
- A read replica that can be promoted to primary if the primary fails.
- Object storage and the CDN keep multiple copies of the files.
- The queue holds jobs safely, so a worker crash only delays thumbnails.