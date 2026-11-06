"""WO — Water Optimization API (FastAPI application factory)."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import SecurityHeadersMiddleware

DESCRIPTION = """
**WO — Water Optimization** is a Knowledge-Based Intelligent Decision Support System for agricultural
water management.

* **AI:** Knowledge-based agent (TELL/ASK), propositional logic, forward and backward chaining,
  model checking (TT-ENTAILS, DPLL, resolution), explainable recommendations. No ML and no generative AI.
* **Search:** land distribution with BFS, UCS, Greedy and A* (admissible heuristic from a relaxed problem).
* **CSP:** irrigation scheduling with AC-3, MRV, LCV and forward checking.
* **Agronomy:** FAO-56 crop water requirement; measured hydroponic water balance.

Authenticate with `POST /api/auth/login`, then send `Authorization: Bearer <token>`.
Errors always use the envelope `{"error": {"code", "message", "details"}}`.
"""

TAGS = [
    {"name": "Authentication"}, {"name": "Users"}, {"name": "Companies"}, {"name": "Farms & plantings"},
    {"name": "Crops (FAO-56 reference)"}, {"name": "Water management"}, {"name": "Smart irrigation"},
    {"name": "Hydroponics"}, {"name": "Weather (Open-Meteo, offline fallback)"},
    {"name": "Knowledge base & logic"}, {"name": "Chatbot (deterministic, KB-backed)"},
    {"name": "Recommendations"}, {"name": "Alerts"}, {"name": "Land distribution (search)"},
    {"name": "Dashboard & analytics"}, {"name": "Administration"}, {"name": "System"},
]


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    settings.validate_runtime()
    app = FastAPI(title=settings.app_name, version="2.0.0", description=DESCRIPTION, openapi_tags=TAGS,
                  docs_url="/api/docs", redoc_url="/api/redoc", openapi_url="/api/openapi.json")
    app.add_middleware(SecurityHeadersMiddleware, enable_hsts=settings.enable_hsts)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
                       allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
                       allow_headers=["Authorization", "Content-Type", "Accept-Language"])
    register_error_handlers(app)
    app.include_router(api_router, prefix="/api")

    @app.get("/api/health", tags=["System"], summary="Liveness and database check")
    def health() -> dict[str, Any]:
        db_ok = True
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
        except Exception:  # noqa: BLE001 - health must never raise
            db_ok = False
        return {"status": "ok" if db_ok else "degraded", "database": db_ok, "version": "2.0.0",
                "weather_offline_mode": settings.weather_offline_mode}

    return app


app = create_app()
