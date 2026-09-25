FROM oven/bun:1.4.0 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN bun build src/index.ts --compile --minify --outfile /app/auth-service

FROM gcr.io/distroless/base-debian13:nonroot

WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /app/auth-service /app/auth-service

ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/app/auth-service"]
