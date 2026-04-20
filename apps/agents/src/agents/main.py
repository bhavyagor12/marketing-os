from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .routes import agents, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup hook: future place to init LangGraph Postgres checkpointer pool
    yield
    # shutdown hook


app = FastAPI(
    title="Marketing OS Agents",
    version="0.0.1",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(agents.router, prefix="/agents", tags=["agents"])


def main() -> None:
    import uvicorn

    uvicorn.run(
        "agents.main:app",
        host="0.0.0.0",  # noqa: S104 — bound publicly inside container; reverse proxy in front
        port=settings.agents_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
