from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    agents_port: int = 8000
    database_url: str
    agents_internal_token: str
    key_encryption_key: str
    log_level: str = "INFO"


settings = Settings()  # type: ignore[call-arg]  # populated from env
