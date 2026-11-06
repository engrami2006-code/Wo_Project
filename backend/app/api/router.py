from __future__ import annotations

from fastapi import APIRouter

from app.api.admin.router import router as admin
from app.api.alerts.router import router as alerts
from app.api.analytics.router import router as analytics
from app.api.auth.router import router as auth
from app.api.chatbot.router import router as chatbot
from app.api.companies.router import router as companies
from app.api.crops.router import router as crops
from app.api.farms.router import router as farms
from app.api.hydroponics.router import router as hydroponics
from app.api.irrigation.router import router as irrigation
from app.api.knowledge_base.router import router as knowledge_base
from app.api.land_distribution.router import router as land_distribution
from app.api.recommendations.router import router as recommendations
from app.api.users.router import router as users
from app.api.water.router import router as water
from app.api.weather.router import router as weather

api_router = APIRouter()
for r in (auth, users, companies, farms, crops, water, irrigation, hydroponics, weather, analytics, alerts,
          recommendations, chatbot, knowledge_base, land_distribution, admin):
    api_router.include_router(r)
