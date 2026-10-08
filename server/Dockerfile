# Stage 1: Build
FROM golang:1.26-alpine AS builder
WORKDIR /app

# Install dependencies first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the Go app
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o synthetic-bull ./cmd/synthetic-bull/main.go

# Stage 2: Run
FROM alpine:latest
WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/synthetic-bull .

# Copy the config folder and assets
COPY --from=builder /app/config ./config
COPY --from=builder /app/internal/config/assets.json ./internal/config/assets.json

EXPOSE 8080

# Execute the binary
CMD ["./synthetic-bull"]