# Stage 1: Build the client
FROM oven/bun:1 as client
WORKDIR /app
COPY client ./client
COPY package.json bun.lock .
RUN bun install --frozen-lockfile
RUN bun build --production --outdir=dist ./client/index.html

# Stage 2: Build the server
FROM golang:1.25.1 as server
WORKDIR /app
ENV CGO_ENABLED=0
COPY . .
RUN go build -o /server ./cli/server/server.go

# Stage 3: Final image
FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=client /app/dist ./dist
COPY --from=server /server .
EXPOSE 8080
CMD ["./server"]
