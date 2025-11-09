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
COPY assets.go go.mod go.sum .
COPY src src
COPY server server
COPY cli cli
# RUN ls -la & sleep 12
COPY --from=client /app/dist ./dist
ARG GIT_COMMIT=unknown
RUN go build -ldflags "-s -w -X 'main.GitCommit=$GIT_COMMIT'" -tags prod -o /server ./cli/server/server.go

# Stage 3: Final image
FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=server /server .
COPY ./server/migration ./server/migration
EXPOSE 8080
CMD ["./server"]
