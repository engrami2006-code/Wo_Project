"""Import every model so Alembic and `Base.metadata` see the full schema."""

from app.models.base import Base
from app.models.crop import Crop, HydroponicProfile, IrrigationMethod
from app.models.farm import Farm, FarmCrop, FarmMember
from app.models.hydroponics import HydroponicRecord, HydroponicSystem
from app.models.knowledge import (
    KnowledgeBase,
    KnowledgeFact,
    KnowledgeRule,
    KnowledgeRuleHistory,
    PerceptDefinition,
)
from app.models.ops import (
    Alert,
    AuditLog,
    ChatMessage,
    ChatSession,
    LandDistributionRequest,
    LandDistributionResult,
    Recommendation,
)
from app.models.user import Company, User
from app.models.water import WaterBaseline, WaterCalculation, WaterRecord
from app.models.weather import WeatherSnapshot

__all__ = [
    "Alert", "AuditLog", "Base", "ChatMessage", "ChatSession", "Company", "Crop", "Farm",
    "FarmCrop", "FarmMember", "HydroponicProfile", "HydroponicRecord", "HydroponicSystem",
    "IrrigationMethod", "KnowledgeBase", "KnowledgeFact", "KnowledgeRule", "KnowledgeRuleHistory",
    "LandDistributionRequest", "LandDistributionResult", "PerceptDefinition", "Recommendation",
    "User", "WaterBaseline", "WaterCalculation", "WaterRecord", "WeatherSnapshot",
]
