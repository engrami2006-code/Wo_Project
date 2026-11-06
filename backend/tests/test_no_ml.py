"""Course constraints: no ML, no generative-AI APIs, no computer vision."""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
FORBIDDEN = ["sklearn", "scikit-learn", "tensorflow", "torch", "keras", "xgboost", "lightgbm", "openai",
             "anthropic", "google-generativeai", "langchain", "transformers", "opencv", "cv2"]


def test_requirements_have_no_ml_or_llm_packages():
    text = (ROOT / "requirements.txt").read_text().lower()
    for pkg in FORBIDDEN:
        assert re.search(rf"^{re.escape(pkg)}\b", text, re.MULTILINE) is None, pkg


def test_application_code_imports_no_ml_or_llm_library():
    pattern = re.compile(r"^\s*(?:import|from)\s+(" + "|".join(re.escape(p.replace("-", "_")) for p in FORBIDDEN) + r")\b",
                         re.MULTILINE)
    for path in (ROOT / "app").rglob("*.py"):
        assert pattern.search(path.read_text(encoding="utf-8")) is None, path
