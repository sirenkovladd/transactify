# Stage 1: Build the client
FROM oven/bun:1 as client-builder
WORKDIR /app
COPY client ./client
COPY package.json bun.lock .
RUN bun install --frozen-lockfile
RUN bun build --production --outdir=dist ./client/index.html

# Stage 2: Build the server
FROM golang:1.25.1 as server-builder
WORKDIR /app
COPY . .
RUN go build -o /server ./cli/server/server.go

# Stage 3: Final image
FROM gcr.io/distroless/base-debian11
WORKDIR /app
COPY --from=client-builder /app/dist ./dist
COPY --from=server-builder /server .
EXPOSE 8080
CMD ["/server"]
