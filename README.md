# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

```
cp .env.example .env
# Замените примерные учётные данные и согласуйте DATABASE_URL с ними.
# Добавьте SQL-файлы в migrations/ перед запуском.

docker compose build api
docker compose up -d
docker compose down

# Повторно выполнить migrate up вручную:
docker compose run --rm migrate

# Создать следующую пару миграций с шестизначным номером:
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/migrations:/migrations" \
  migrate/migrate:v4.19.1 \
  create -ext sql -dir /migrations -seq -digits 6 add_your_change
```