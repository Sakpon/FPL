from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "FPL Prediction Portal"
    database_url: str = f"sqlite:///{DATA_DIR / 'fpl.db'}"

    fpl_api_base: str = "https://fantasy.premierleague.com/api"
    vaastav_raw_base: str = (
        "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master"
    )
    historical_seasons: tuple[str, ...] = ("2023-24", "2024-25", "2025-26")

    youtube_channels: tuple[str, ...] = (
        # channel handles of the top FPL gurus we scrape
        "LetsTalkFPL",
        "FPLHarry",
        "FPLFamily",
        "FPLMate",
        "FPLFocal",
        "PlanetFPL",
        "FPLRaptor",
        "FPLBlackBox",
        "TheFPLWire",
        "FPLAndy",
    )
    twitter_handles: tuple[str, ...] = (
        "FPLHarry",
        "LetsTalkFPL",
        "FPL_Family",
        "FPLMate",
        "FPLRaptor",
        "OfficialFPL",
        "FPLFocal",
        "FPL_BlackBox",
        "FPL_Salah",
        "FPLGeneral",
    )

    model_dir: Path = ROOT_DIR / "app" / "ml" / "models"
    allow_offline_seed: bool = True


settings = Settings()
settings.model_dir.mkdir(parents=True, exist_ok=True)
