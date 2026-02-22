## Log history

---

`2026.02.22` prisma 
```text
{"level":30,"time":1771762340576,"pid":37148,"hostname":"LAPTOP-QDBENQF0","msg":"Server listening at http://127.0.0.1:8080"}
{"level":30,"time":1771762393337,"pid":37148,"hostname":"LAPTOP-QDBENQF0","reqId":"req-1","req":{"method":"POST","url":"/api/shorten","hostname":"localhost:8080","remoteAddress":"127.0.0.1","remotePort":56246},"msg":"incoming request"}
prisma:query SELECT "public"."urls"."id", "public"."urls"."original_url", "public"."urls"."short_code", "public"."urls"."created_at", "public"."urls"."updated_at" FROM "public"."urls" WHERE "public"."urls"."original_url" = $1 LIMIT $2 OFFSET $3
prisma:query SELECT "public"."urls"."id", "public"."urls"."original_url", "public"."urls"."short_code", "public"."urls"."created_at", "public"."urls"."updated_at" FROM "public"."urls" WHERE ("public"."urls"."short_code" = $1 AND 1=1) LIMIT $2 OFFSET $3
prisma:query INSERT INTO "public"."urls" ("original_url","short_code","created_at","updated_at") VALUES ($1,$2,$3,$4) RETURNING "public"."urls"."id", "public"."urls"."original_url", "public"."urls"."short_code", "public"."urls"."created_at", "public"."urls"."updated_at"
{"level":30,"time":1771762393719,"pid":37148,"hostname":"LAPTOP-QDBENQF0","reqId":"req-1","res":{"statusCode":201},"responseTime":381.54330000281334,"msg":"request completed"}
{"level":30,"time":1771762423848,"pid":37148,"hostname":"LAPTOP-QDBENQF0","reqId":"req-2","req":{"method":"GET","url":"/HhSoVOC","hostname":"localhost:8080","remoteAddress":"127.0.0.1","remotePort":56259},"msg":"incoming request"}
prisma:query SELECT "public"."urls"."id", "public"."urls"."original_url", "public"."urls"."short_code", "public"."urls"."created_at", "public"."urls"."updated_at" FROM "public"."urls" WHERE ("public"."urls"."short_code" = $1 AND 1=1) LIMIT $2 OFFSET $3
{"level":30,"time":1771762423867,"pid":37148,"hostname":"LAPTOP-QDBENQF0","reqId":"req-2","res":{"statusCode":302},"responseTime":18.53990000486374,"msg":"request completed"}
```