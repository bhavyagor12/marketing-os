SHELL := /bin/bash
.DEFAULT_GOAL := help

CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m
RESET  := \033[0m

##@ Marketing OS dev toolkit

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make $(CYAN)<target>$(RESET)\n"} \
	  /^[a-zA-Z_-]+:.*?##/ { printf "  $(CYAN)%-16s$(RESET) %s\n", $$1, $$2 } \
	  /^##@/ { printf "\n$(YELLOW)%s$(RESET)\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo ""

##@ One-shot commands

setup: check-tools env install infra-up wait-db minio-bucket db-push ## Full first-time setup
	@printf "\n$(GREEN)✓ Setup complete.$(RESET) Run '$(CYAN)make start$(RESET)' to launch all services.\n"

start: infra-up ## Start infra + all dev services (web, worker, agents)
	@pnpm dev

stop: ## Stop all docker services
	@docker compose down

restart: stop start ## Restart everything

reset: ## Destructive: drop volumes + reinstall + re-setup
	@printf "$(RED)This deletes all DB data, media, and caches. Continue? [y/N]$(RESET) "; \
	  read c; [[ "$$c" == "y" || "$$c" == "Y" ]] || exit 1
	@docker compose down -v
	@rm -rf node_modules apps/*/node_modules packages/*/node_modules
	@rm -rf apps/agents/.venv
	@rm -f .env apps/agents/.env
	@$(MAKE) setup

##@ Pieces

infra-up: ## docker compose up -d (postgres, redis, minio)
	@docker compose up -d
	@printf "$(GREEN)✓ infra up$(RESET)\n"

infra-down: ## Stop infra
	@docker compose down

db-init: ## Ensure required Postgres extensions exist (pgvector)
	@docker compose exec -T postgres psql -U postgres -d marketing_os -v ON_ERROR_STOP=1 \
	  -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null
	@printf "$(GREEN)✓ pgvector extension ready$(RESET)\n"

db-push: db-init ## Push Drizzle schema to postgres (creates extensions first)
	@pnpm db:push

db-studio: ## Open Drizzle Studio (browser UI for db)
	@pnpm db:studio

logs: ## Tail docker logs
	@docker compose logs -f

env-regen: ## Regenerate .env files with fresh secrets (DESTROYS existing .env)
	@rm -f .env apps/agents/.env
	@$(MAKE) env

##@ Internals

check-tools:
	@command -v node >/dev/null 2>&1 || { printf "$(RED)node not found.$(RESET) Install Node 20: nvm install 20 && nvm use 20\n"; exit 1; }
	@command -v pnpm >/dev/null 2>&1 || { printf "$(RED)pnpm not found.$(RESET) Run: corepack enable && corepack prepare pnpm@9.12.0 --activate\n"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { printf "$(RED)docker not found.$(RESET) Install Docker Desktop for macOS.\n"; exit 1; }
	@command -v uv >/dev/null 2>&1 || { printf "$(RED)uv not found.$(RESET) Install: brew install uv (or curl -LsSf https://astral.sh/uv/install.sh | sh)\n"; exit 1; }
	@printf "$(GREEN)✓ prereqs ok$(RESET)\n"

env:
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  SECRET_AUTH=$$(openssl rand -hex 32); \
	  SECRET_KEK=$$(openssl rand -base64 32); \
	  SECRET_INT=$$(openssl rand -hex 32); \
	  sed -i.bak "s|replace-with-openssl-rand-hex-32|$$SECRET_AUTH|" .env; \
	  sed -i.bak "s|replace-with-base64-32-bytes|$$SECRET_KEK|" .env; \
	  sed -i.bak "s|replace-with-shared-secret|$$SECRET_INT|" .env; \
	  rm .env.bak; \
	  printf "$(GREEN)✓ generated .env with fresh secrets$(RESET)\n"; \
	else \
	  printf "$(YELLOW)• .env exists — leaving it alone$(RESET)\n"; \
	fi
	@if [ ! -f apps/agents/.env ]; then \
	  cp apps/agents/.env.example apps/agents/.env; \
	  DB_URL=$$(grep '^DATABASE_URL=' .env | cut -d'=' -f2-); \
	  TOK=$$(grep '^AGENTS_INTERNAL_TOKEN=' .env | cut -d'=' -f2-); \
	  KEK=$$(grep '^KEY_ENCRYPTION_KEY=' .env | cut -d'=' -f2-); \
	  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$$DB_URL|" apps/agents/.env; \
	  sed -i.bak "s|^AGENTS_INTERNAL_TOKEN=.*|AGENTS_INTERNAL_TOKEN=$$TOK|" apps/agents/.env; \
	  sed -i.bak "s|^KEY_ENCRYPTION_KEY=.*|KEY_ENCRYPTION_KEY=$$KEK|" apps/agents/.env; \
	  rm apps/agents/.env.bak; \
	  printf "$(GREEN)✓ generated apps/agents/.env$(RESET)\n"; \
	else \
	  printf "$(YELLOW)• apps/agents/.env exists — leaving it alone$(RESET)\n"; \
	fi
	@ln -sf ../../.env apps/web/.env.local
	@printf "$(GREEN)✓ linked apps/web/.env.local -> .env$(RESET)\n"

install: install-js install-py

install-js:
	@printf "$(CYAN)→ installing js deps$(RESET)\n"
	@pnpm install

install-py:
	@if [ ! -d apps/agents/.venv ]; then \
	  printf "$(CYAN)→ creating python 3.12 venv via uv + installing agents deps$(RESET)\n"; \
	  cd apps/agents && uv venv --python 3.12 && \
	    uv pip install --quiet -e ".[dev]"; \
	  printf "$(GREEN)✓ python env ready$(RESET)\n"; \
	else \
	  printf "$(YELLOW)• apps/agents/.venv exists — skipping (run 'make reset' to rebuild)$(RESET)\n"; \
	fi

wait-db:
	@printf "$(CYAN)→ waiting for postgres$(RESET)\n"
	@for i in $$(seq 1 30); do \
	  docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && printf "$(GREEN)✓ postgres ready$(RESET)\n" && exit 0; \
	  sleep 1; \
	done; \
	printf "$(RED)✗ postgres did not become ready in 30s$(RESET)\n"; exit 1

minio-bucket:
	@printf "$(CYAN)→ ensuring minio bucket exists$(RESET)\n"
	@docker compose --profile init up --exit-code-from minio-init minio-init 2>&1 | tail -3 || true

.PHONY: help setup start stop restart reset infra-up infra-down db-init db-push db-studio logs env-regen check-tools env install install-js install-py wait-db minio-bucket
