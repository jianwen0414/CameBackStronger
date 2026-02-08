"""
NightWalk - Crime Report Validation Pipeline
Orchestrates the full validation flow for user-reported crimes:

  1. Mark report as "processing" in the database
  2. Download the evidence video from the provided URL
  3. Run VideoMAE classification (video_classifier.py)
  4. Run Gemini multimodal analysis (gemini_analyzer.py)
  5. Determine validation status based on both AI outputs
  6. Update the database record with all results

This module is invoked as a FastAPI BackgroundTask so the citizen
gets an immediate response while processing happens asynchronously.
"""
import os
import tempfile
import logging
import traceback

import httpx

from video_classifier import classify_video
from gemini_analyzer import analyze_crime_video
from database import update_crime_report_validation

logger = logging.getLogger("nightwalk.pipeline")


async def _download_video(evidence_video_url: str) -> str:
    """
    Download a video file from a URL to a temporary file.

    Handles:
      - Regular HTTPS URLs
      - Google Cloud Storage gs:// URLs (converted to public HTTPS)
      - Supabase storage URLs

    Args:
        evidence_video_url: The URL of the evidence video

    Returns:
        Path to the downloaded temporary file

    Raises:
        RuntimeError: If download fails
    """
    url = evidence_video_url

    # Convert gs:// to public HTTPS
    if url.startswith("gs://"):
        url = url.replace("gs://", "https://storage.googleapis.com/", 1)

    logger.info(f"📥 Downloading evidence video: {url[:100]}...")

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=15.0),
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

        # Determine file extension from URL or content-type
        content_type = response.headers.get("content-type", "")
        if "mp4" in content_type or url.endswith(".mp4"):
            suffix = ".mp4"
        elif "webm" in content_type or url.endswith(".webm"):
            suffix = ".webm"
        elif "avi" in content_type or url.endswith(".avi"):
            suffix = ".avi"
        elif "mov" in content_type or url.endswith(".mov"):
            suffix = ".mov"
        else:
            suffix = ".mp4"  # Default assumption

        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix, prefix="nightwalk_evidence_"
        ) as tmp:
            tmp.write(response.content)
            video_path = tmp.name

        file_size_mb = len(response.content) / (1024 * 1024)
        logger.info(
            f"✅ Video downloaded: {video_path} ({file_size_mb:.1f} MB)"
        )
        return video_path

    except httpx.HTTPStatusError as e:
        raise RuntimeError(
            f"HTTP {e.response.status_code} downloading video from: {url}"
        ) from e
    except httpx.RequestError as e:
        raise RuntimeError(
            f"Network error downloading video: {str(e)}"
        ) from e


async def process_crime_report(
    report_id: str,
    evidence_video_url: str,
    user_reported_type: str,
    description: str | None = None,
) -> None:
    """
    Full validation pipeline for a user-reported crime.

    This is designed to be called via FastAPI's BackgroundTasks.
    It runs asynchronously after the POST /reports/crime response is sent.

    Steps:
      1. Update status → "processing"
      2. Download video to temp file
      3. Run VideoMAE classification
      4. Run Gemini analysis (with video + classification context)
      5. Determine final status (validated / rejected)
      6. Update database with all results

    Args:
        report_id: UUID of the crime report record
        evidence_video_url: URL to the uploaded evidence video
        user_reported_type: Crime type the user selected (e.g. "robbery")
        description: Optional text description from the user
    """
    video_path: str | None = None

    logger.info(f"🔄 Starting validation pipeline for report {report_id}")

    # Step 1: Mark as processing
    try:
        await update_crime_report_validation(
            report_id=report_id,
            validation_status="processing",
        )
    except Exception as e:
        logger.error(f"Failed to mark report as processing: {e}")
        # Continue anyway — the actual analysis is more important

    try:
        # Step 2: Download video
        video_path = await _download_video(evidence_video_url)

        # Step 3: VideoMAE classification
        logger.info(f"🔍 Running VideoMAE classification for report {report_id}...")
        classification = classify_video(video_path)
        logger.info(
            f"🔍 Classification: {classification['label']} "
            f"({classification['confidence']:.1%})"
        )

        # Step 4: Gemini analysis
        logger.info(f"🧠 Running Gemini analysis for report {report_id}...")
        gemini_result = analyze_crime_video(
            video_path=video_path,
            classification_result=classification,
            user_reported_type=user_reported_type,
            description=description,
        )
        logger.info(
            f"🧠 Gemini verdict: legitimate={gemini_result['is_legitimate']}, "
            f"severity={gemini_result.get('severity', 'unknown')}"
        )

        # Step 5: Determine final validation status
        is_normal = classification["label"] == "Normal Videos"
        gemini_says_legitimate = gemini_result.get("is_legitimate", False)
        confidence = classification["confidence"]

        from config import get_settings
        threshold = get_settings().classification_confidence_threshold

        if gemini_says_legitimate and not is_normal:
            # Both AI systems agree it's a crime
            validation_status = "validated"
        elif gemini_says_legitimate and is_normal and confidence < 0.5:
            # Model uncertain but Gemini sees something — trust Gemini
            validation_status = "validated"
        elif not gemini_says_legitimate and is_normal:
            # Both agree it's not a crime
            validation_status = "rejected"
        elif not gemini_says_legitimate and not is_normal and confidence > 0.8:
            # Model very confident it's a crime but Gemini disagrees — flag for review
            validation_status = "reviewed"
        else:
            # Ambiguous — use Gemini as tiebreaker
            validation_status = "validated" if gemini_says_legitimate else "rejected"

        # Build analysis text combining both AI outputs
        severity = gemini_result.get("severity", "medium")
        gemini_type = gemini_result.get("gemini_classified_type", "unknown")

        analysis_text = gemini_result.get("analysis", "")
        justification_text = gemini_result.get("justification", "")

        # Enrich justification with classification context
        full_justification = (
            f"{justification_text}\n\n"
            f"[VideoMAE] Predicted: {classification['label']} "
            f"({classification['confidence']:.1%} confidence). "
            f"[Gemini] Assessment: {gemini_type.replace('_', ' ').title()}, "
            f"Severity: {severity.upper()}. "
            f"Final status: {validation_status.upper()}."
        )

        # Step 6: Update database
        await update_crime_report_validation(
            report_id=report_id,
            validation_status=validation_status,
            classified_crime_type=classification["label"],
            classification_confidence=classification["confidence"],
            classification_result=classification["all_probabilities"],
            gemini_analysis=analysis_text,
            gemini_justification=full_justification,
        )

        logger.info(
            f"✅ Pipeline complete for report {report_id}: "
            f"status={validation_status}, "
            f"model={classification['label']} ({classification['confidence']:.1%}), "
            f"gemini_legitimate={gemini_says_legitimate}"
        )

    except Exception as e:
        # Pipeline failed — mark as rejected with error info
        error_msg = f"Validation pipeline error: {str(e)}"
        logger.error(f"❌ Pipeline failed for report {report_id}: {error_msg}")
        logger.error(traceback.format_exc())

        try:
            await update_crime_report_validation(
                report_id=report_id,
                validation_status="rejected",
                gemini_analysis=error_msg,
                gemini_justification=(
                    "Automated validation failed due to a processing error. "
                    "This report requires manual review by an administrator."
                ),
            )
        except Exception as update_err:
            logger.error(
                f"❌ Failed to update report {report_id} after pipeline error: "
                f"{update_err}"
            )

    finally:
        # Clean up temp video file
        if video_path and os.path.exists(video_path):
            try:
                os.unlink(video_path)
                logger.info(f"🗑️ Cleaned up temp file: {video_path}")
            except OSError as e:
                logger.warning(f"⚠️ Failed to delete temp file {video_path}: {e}")
