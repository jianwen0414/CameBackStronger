"""
NightWalk — End-to-End Pipeline Test Script
=============================================
Simulates a complete user-reported crime submission using a local video file.

Usage:
    cd backend
    uv run python test_pipeline.py

What it does:
    1. Inserts a fake crime report into Supabase (status: pending)
    2. Runs VideoMAE classification on the local video
    3. Sends the video + classification context to Gemini for analysis
    4. Determines the final validation status
    5. Updates the DB record with all AI results

The report will appear on the web dashboard (all statuses) and, if validated,
on the mobile app (validated only) — just like a real submission.
"""
import os
import sys
import json
import asyncio
import logging
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Logging setup — pretty colours for terminal readability
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("nightwalk.test")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# The local video file to test with (relative to project root)
VIDEO_FILENAME = "Robber_Attempts_Street_Handbag_Theft.mp4"

# Simulated report details (as if a citizen submitted via the mobile app)
SIMULATED_REPORT = {
    "lat": 3.1399,               # KL Sentral area, Kuala Lumpur
    "long": 101.6869,
    "crime_type": "robbery",     # What the citizen selected in the app
    "description": (
        "A man on a motorcycle attempted to snatch a woman's handbag "
        "while she was walking along the street. The incident was caught "
        "on a nearby dashcam."
    ),
}


def resolve_video_path() -> str:
    """Find the test video file."""
    # Try project root first
    project_root = Path(__file__).resolve().parent.parent
    candidates = [
        project_root / VIDEO_FILENAME,
        Path(__file__).resolve().parent / VIDEO_FILENAME,
        Path.cwd() / VIDEO_FILENAME,
    ]
    for p in candidates:
        if p.exists():
            logger.info(f"📹 Found test video: {p}")
            return str(p)

    print(f"\n❌ ERROR: Could not find '{VIDEO_FILENAME}'.")
    print(f"   Looked in:")
    for p in candidates:
        print(f"     - {p}")
    print(f"\n   Place a test video named '{VIDEO_FILENAME}' in the project root and try again.\n")
    sys.exit(1)


async def main():
    start = time.time()
    print()
    print("=" * 70)
    print("  NightWalk — AI Validation Pipeline Test")
    print("=" * 70)
    print()

    video_path = resolve_video_path()
    file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
    logger.info(f"📹 Video size: {file_size_mb:.1f} MB")

    # ------------------------------------------------------------------
    # Step 1: Insert a test report into Supabase
    # ------------------------------------------------------------------
    print("\n" + "─" * 50)
    print("  STEP 1 · Insert test crime report into Supabase")
    print("─" * 50)

    from database import insert_user_reported_crime

    result = await insert_user_reported_crime(
        lat=SIMULATED_REPORT["lat"],
        long=SIMULATED_REPORT["long"],
        crime_type=SIMULATED_REPORT["crime_type"],
        evidence_video_url=f"file://{video_path}",  # placeholder URL
        description=SIMULATED_REPORT["description"],
        reporter_id=None,
    )

    report_id = str(result.get("id", "unknown"))
    logger.info(f"✅ Report created in DB: {report_id}")

    # Mark as processing
    from database import update_crime_report_validation

    await update_crime_report_validation(
        report_id=report_id,
        validation_status="processing",
    )
    logger.info("📝 Status updated to 'processing'")

    # ------------------------------------------------------------------
    # Step 2: Run VideoMAE classification
    # ------------------------------------------------------------------
    print("\n" + "─" * 50)
    print("  STEP 2 · VideoMAE Crime Classification")
    print("─" * 50)

    from video_classifier import classify_video

    t0 = time.time()
    classification = classify_video(video_path)
    t1 = time.time()

    print(f"\n  🔍 Top Prediction : {classification['label']}")
    print(f"  📊 Confidence     : {classification['confidence']:.1%}")
    print(f"  🚨 Is Crime       : {classification['is_crime']}")
    print(f"  ⏱️  Inference Time : {t1 - t0:.1f}s")
    print(f"\n  Top 3 Predictions:")
    for i, (label, prob) in enumerate(classification["top_3"], 1):
        bar = "█" * int(prob * 40) + "░" * (40 - int(prob * 40))
        print(f"    {i}. {label:20s} {prob:6.1%}  {bar}")

    print(f"\n  All Probabilities:")
    for label, prob in sorted(
        classification["all_probabilities"].items(),
        key=lambda x: x[1],
        reverse=True,
    ):
        indicator = " ◄─ TOP" if label == classification["label"] else ""
        print(f"    {label:20s} {prob:6.2%}{indicator}")

    # ------------------------------------------------------------------
    # Step 3: Gemini multimodal analysis
    # ------------------------------------------------------------------
    print("\n" + "─" * 50)
    print("  STEP 3 · Gemini AI Multimodal Analysis")
    print("─" * 50)

    from config import get_settings
    settings = get_settings()

    if not settings.gemini_api_key:
        print("\n  ⚠️  GEMINI_API_KEY is not set in backend/.env")
        print("     Skipping Gemini analysis.")
        print("     Get a free key at: https://aistudio.google.com/apikey")
        print("     Add to backend/.env:  GEMINI_API_KEY=your_key_here\n")
        gemini_result = {
            "analysis": "Gemini analysis skipped — no API key configured.",
            "justification": "Unable to perform AI analysis without Gemini API key.",
            "is_legitimate": False,
            "gemini_classified_type": "unknown",
            "severity": "medium",
        }
    else:
        from gemini_analyzer import analyze_crime_video

        t2 = time.time()
        gemini_result = analyze_crime_video(
            video_path=video_path,
            classification_result=classification,
            user_reported_type=SIMULATED_REPORT["crime_type"],
            description=SIMULATED_REPORT["description"],
        )
        t3 = time.time()

        print(f"\n  ⏱️  Gemini Response Time: {t3 - t2:.1f}s")

    print(f"\n  📝 Scene Analysis:")
    print(f"     {gemini_result.get('analysis', 'N/A')}")
    print(f"\n  ⚖️  Justification:")
    print(f"     {gemini_result.get('justification', 'N/A')}")
    print(f"\n  ✅ Is Legitimate  : {gemini_result.get('is_legitimate')}")
    print(f"  🏷️  Gemini Type    : {gemini_result.get('gemini_classified_type')}")
    print(f"  🔴 Severity       : {gemini_result.get('severity')}")

    # ------------------------------------------------------------------
    # Step 4: Determine validation status (same logic as pipeline)
    # ------------------------------------------------------------------
    print("\n" + "─" * 50)
    print("  STEP 4 · Validation Decision")
    print("─" * 50)

    is_normal = classification["label"] == "Normal Videos"
    gemini_says_legitimate = gemini_result.get("is_legitimate", False)
    confidence = classification["confidence"]

    if gemini_says_legitimate and not is_normal:
        validation_status = "validated"
        reason = "Both AI systems agree it's a crime"
    elif gemini_says_legitimate and is_normal and confidence < 0.5:
        validation_status = "validated"
        reason = "Model uncertain but Gemini sees something — trust Gemini"
    elif not gemini_says_legitimate and is_normal:
        validation_status = "rejected"
        reason = "Both agree it's not a crime"
    elif not gemini_says_legitimate and not is_normal and confidence > 0.8:
        validation_status = "reviewed"
        reason = "Model very confident it's a crime but Gemini disagrees — flag for review"
    else:
        validation_status = "validated" if gemini_says_legitimate else "rejected"
        reason = "Ambiguous — used Gemini as tiebreaker"

    print(f"\n  📋 Final Status: {validation_status.upper()}")
    print(f"  💡 Reason: {reason}")

    # ------------------------------------------------------------------
    # Step 5: Update Supabase with all results
    # ------------------------------------------------------------------
    print("\n" + "─" * 50)
    print("  STEP 5 · Update Database Record")
    print("─" * 50)

    severity = gemini_result.get("severity", "medium")
    gemini_type = gemini_result.get("gemini_classified_type", "unknown")
    analysis_text = gemini_result.get("analysis", "")
    justification_text = gemini_result.get("justification", "")

    full_justification = (
        f"{justification_text}\n\n"
        f"[VideoMAE] Predicted: {classification['label']} "
        f"({classification['confidence']:.1%} confidence). "
        f"[Gemini] Assessment: {gemini_type.replace('_', ' ').title()}, "
        f"Severity: {severity.upper()}. "
        f"Final status: {validation_status.upper()}."
    )

    await update_crime_report_validation(
        report_id=report_id,
        validation_status=validation_status,
        classified_crime_type=classification["label"],
        classification_confidence=classification["confidence"],
        classification_result=classification["all_probabilities"],
        gemini_analysis=analysis_text,
        gemini_justification=full_justification,
    )

    logger.info(f"✅ Database updated for report {report_id}")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    elapsed = time.time() - start

    print("\n" + "=" * 70)
    print("  ✅  PIPELINE TEST COMPLETE")
    print("=" * 70)
    print(f"""
  Report ID        : {report_id}
  Video            : {VIDEO_FILENAME} ({file_size_mb:.1f} MB)
  Reported Type    : {SIMULATED_REPORT['crime_type']}
  VideoMAE Label   : {classification['label']} ({classification['confidence']:.1%})
  Gemini Type      : {gemini_type}
  Gemini Legitimate: {gemini_result.get('is_legitimate')}
  Severity         : {severity}
  Final Status     : {validation_status.upper()}
  Total Time       : {elapsed:.1f}s

  👉  Open the web dashboard to see this report as a purple beacon.
  👉  Click the beacon to view the full AI analysis in the modal.
""")


if __name__ == "__main__":
    asyncio.run(main())
