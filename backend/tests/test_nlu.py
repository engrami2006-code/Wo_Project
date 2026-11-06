"""Deterministic Arabic/English NLU (no ML)."""

from datetime import date

from app.ai.chatbot.nlu import (
    Candidate,
    detect_intent,
    extract_date,
    extract_labeled,
    extract_quantity_l,
    match_candidates,
    normalize,
)


def test_arabic_normalization():
    assert normalize("هَلْ أَسْقِي الطَّمَاطِم؟") == "هل اسقي الطماطم"
    assert normalize("المياهـــ ٣٠٠٠ لتر") == "المياه 3000 لتر"
    assert normalize("إنتاجية الأرض") == "انتاجيه الارض"


def test_intents_in_arabic_and_english():
    cases = {"هل أسقي الطماطم اليوم؟": "irrigation_advice", "Should I irrigate the tomatoes today?": "irrigation_advice",
             "كم استهلكت مياه هذا الأسبوع": "water_usage", "what's the weather today": "weather",
             "حالة المحلول في الزراعة المائية": "hydroponic_status", "ليش؟": "explain_last",
             "show me the alerts": "alerts", "مرحبا": "greeting"}
    for text, intent in cases.items():
        assert detect_intent(normalize(text)).intent == intent, text
    assert detect_intent(normalize("blue banana")).intent is None


def test_entities():
    today = date(2026, 10, 3)
    assert extract_date(normalize("بكرة"), today) == date(2026, 10, 4)
    assert extract_date(normalize("today"), today) == today
    assert extract_quantity_l(normalize("2.5 m3")) == 2500
    assert extract_quantity_l(normalize("5,000 L")) == 5000
    assert extract_labeled(normalize("التبخر 6.2 المطر 0")) == {"et0": 6.2, "rain": 0.0}
    assert extract_labeled(normalize("ET0=5.5, rain 3")) == {"et0": 5.5, "rain": 3.0}
    cands = [Candidate("1", "Tomato", "طماطم", ["Tomato", "طماطم", "tomatoes"]),
             Candidate("2", "Lettuce", "خس", ["Lettuce", "خس"])]
    assert [c.id for c in match_candidates(normalize("هل أسقي الطماطم"), cands)] == ["1"]
    assert [c.id for c in match_candidates(normalize("water the tomatoes"), cands)] == ["1"]
