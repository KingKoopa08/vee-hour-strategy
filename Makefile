.PHONY: help build up down logs clean restart dev prod test

help:
	@echo "Available commands:"
	@echo "  make build    - Build all Docker images"
	@echo "  make up       - Start all services"
	@echo "  make down     - Stop all services"
	@echo "  make logs     - View logs from all services"
	@echo "  make clean    - Remove all containers and volumes"
	@echo "  make restart  - Restart all services"
	@echo "  make dev      - Start in development mode"
	@echo "  make prod     - Start in production mode"
	@echo "  make test     - Run all tests"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	docker system prune -f

restart:
	docker-compose down
	docker-compose up -d

dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

test:
	cd backend && npm test
	cd frontend && npm test

backend-logs:
	docker-compose logs -f backend

frontend-logs:
	docker-compose logs -f frontend

db-shell:
	docker-compose exec postgres psql -U trader -d trading_analysis

redis-cli:
	docker-compose exec redis redis-cli

install:
	cd backend && npm install
	cd frontend && npm install