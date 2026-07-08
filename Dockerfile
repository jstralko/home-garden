FROM node:22-alpine AS frontend

WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.24-alpine AS backend

WORKDIR /src/backend
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/home-garden-backend .

FROM alpine:3.22

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=backend /out/home-garden-backend ./home-garden-backend
COPY --from=frontend /src/frontend/dist ./frontend/dist

ENV PORT=8080
ENV FRONTEND_DIST=/app/frontend/dist
ENV FEED_CACHE_TTL_SECONDS=30

EXPOSE 8080
USER app

CMD ["./home-garden-backend"]
