"""
NightWalk - Gemini AI Analysis Module
Uses the Google Gemini API to analyze crime evidence videos.

Gemini receives:
  1. The actual video file (uploaded via the Files API)
  2. The VideoMAE classification result (label + confidence + probabilities)
  3. The user's reported crime type and description

Gemini produces:
  - A detailed scene analysis describing what it observes in the video
  - A justification of whether the reported crime is legitimate
  - A boolean verdict (is_legitimate) used to set validation_status
"""
import json
import time
import logging
from typing import Optional

logger = logging.getLogger("nightwalk.gemini")


def _get_client():
    """
    Create a Gemini client using the Google GenAI SDK.
    Uses GEMINI_API_KEY from environment / settings.
    """
    from google import genai
    from config import get_settings

    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your backend .env file. "
            "Get a free key at https://aistudio.google.com/apikey"
        )
    return genai.Client(api_key=settings.gemini_api_key)


def _get_model_name() -> str:
    """Get the configured Gemini model name."""
    from config import get_settings
    return get_settings().gemini_model


def _upload_and_wait(client, video_path: str, max_wait: int = 120):
    """
    Upload a video file to the Gemini Files API and wait until it's
    fully processed (state == ACTIVE).

    Args:
        client: google.genai.Client
        video_path: Local path to video file
        max_wait: Maximum seconds to wait for processing

    Returns:
        The uploaded file object ready for use in generate_content
    """
    logger.info(f"📤 Uploading video to Gemini Files API: {video_path}")
    video_file = client.files.upload(file=video_path)
    logger.info(f"📤 Upload complete: {video_file.name} (state: {video_file.state})")

    # Wait for processing to complete
    # The SDK returns state as a FileState enum (e.g. FileState.PROCESSING).
    # We normalise to a plain uppercase string for safe comparison.
    elapsed = 0
    poll_interval = 3

    def _state_str(f) -> str:
        """Extract a clean uppercase state string from a file object."""
        raw = str(getattr(f, "state", "ACTIVE"))
        # Handle enum names like "FileState.PROCESSING" → "PROCESSING"
        return raw.rsplit(".", 1)[-1].upper()

    while _state_str(video_file) not in ("ACTIVE", "FAILED"):
        if elapsed >= max_wait:
            raise TimeoutError(
                f"Gemini file processing timed out after {max_wait}s "
                f"for file: {video_file.name}"
            )
        logger.info(f"⏳ Waiting for Gemini to process video... ({elapsed}s / {max_wait}s)")
        time.sleep(poll_interval)
        elapsed += poll_interval
        video_file = client.files.get(name=video_file.name)

    if _state_str(video_file) == "FAILED":
        raise RuntimeError(f"Gemini file processing failed for: {video_file.name}")

    logger.info(f"✅ Video ready: {video_file.name}")
    return video_file


def analyze_crime_video(
    video_path: str,
    classification_result: dict,
    user_reported_type: str,
    description: Optional[str] = None,
) -> dict:
    """
    Analyze a crime evidence video using Gemini multimodal capabilities.

    The function:
      1. Uploads the video to the Gemini Files API
      2. Sends a structured prompt with the video + classification context
      3. Parses the JSON response
      4. Cleans up the uploaded file

    Args:
        video_path: Local path to the video file
        classification_result: Output from video_classifier.classify_video()
        user_reported_type: The crime type the citizen selected (e.g. "robbery")
        description: Optional free-text description from the citizen

    Returns:
        Dictionary with keys:
            - analysis: Detailed scene description (2-4 sentences)
            - justification: Whether report appears legitimate (2-3 sentences)
            - is_legitimate: Boolean verdict
            - gemini_classified_type: What Gemini thinks the crime type is
            - severity: "low" | "medium" | "high" | "critical"
    """
    from google.genai import types

    client = _get_client()
    model_name = _get_model_name()

    # Upload video and wait for processing
    video_file = _upload_and_wait(client, video_path)

    # Format top-3 predictions for the prompt
    top_3_str = "\n".join(
        f"  {i+1}. {label}: {prob:.1%}"
        for i, (label, prob) in enumerate(classification_result.get("top_3", []))
    )

    prompt = f"""You are an expert AI crime analyst for NightWalk, an urban safety surveillance system. 
Your role is to analyze video evidence submitted by citizens reporting crimes.

## Context

A citizen submitted a crime report through our mobile app:
- **Reported crime type**: {user_reported_type.replace('_', ' ').title()}
{f'- **Citizen description**: "{description}"' if description else '- **Citizen description**: (none provided)'}

Our automated VideoMAE classification model (fine-tuned on the UCF-Crime dataset, 92.96% accuracy) analyzed the video and produced:
- **Top prediction**: {classification_result['label']} ({classification_result['confidence']:.1%} confidence)
- **Is criminal activity**: {classification_result['is_crime']}
- **Top 3 predictions**:
{top_3_str}

## Your Task

Watch the video carefully and provide your analysis.  Consider:
1. What actions, people, and environment are visible?
2. Does the video content match the citizen's reported crime type?
3. Does the video content align with the model's classification?
4. Is there enough evidence to validate this as a real crime report?

## Required JSON Response

Respond with ONLY valid JSON (no markdown fencing) containing these keys:
{{
    "analysis": "A detailed 2-4 sentence description of what you observe in the video: the scene, visible actions, people, environment, and any signs of criminal activity.",
    "justification": "A 2-3 sentence justification for your verdict. Explain whether the citizen's report and model's classification are consistent with what you see. Mention any discrepancies.",
    "is_legitimate": true or false,
    "gemini_classified_type": "your assessment of the crime type (use one of: abuse, arrest, arson, assault, burglary, explosion, fighting, normal, road_accidents, robbery, shooting, shoplifting, stealing, vandalism)",
    "severity": "one of: low, medium, high, critical"
}}"""

    try:
        logger.info(f"🧠 Sending video to Gemini ({model_name}) for analysis...")

        response = client.models.generate_content(
            model=model_name,
            contents=[video_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )

        raw_text = response.text.strip()

        # Parse JSON response — handle potential markdown fencing
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            # Remove first and last lines (fencing)
            json_lines = []
            inside = False
            for line in lines:
                if line.strip().startswith("```") and not inside:
                    inside = True
                    continue
                if line.strip() == "```" and inside:
                    break
                if inside:
                    json_lines.append(line)
            raw_text = "\n".join(json_lines)

        result = json.loads(raw_text)

        # Validate required keys with defaults
        analysis = {
            "analysis": result.get("analysis", "Unable to generate analysis."),
            "justification": result.get("justification", "Unable to generate justification."),
            "is_legitimate": result.get("is_legitimate", False),
            "gemini_classified_type": result.get("gemini_classified_type", "unknown"),
            "severity": result.get("severity", "medium"),
        }

        logger.info(
            f"✅ Gemini analysis complete — Legitimate: {analysis['is_legitimate']}, "
            f"Severity: {analysis['severity']}"
        )

        return analysis

    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse Gemini JSON response: {e}")
        logger.error(f"Raw response: {raw_text[:500]}")
        return {
            "analysis": f"Gemini response could not be parsed. Raw: {raw_text[:200]}",
            "justification": "Analysis failed due to malformed AI response.",
            "is_legitimate": False,
            "gemini_classified_type": "unknown",
            "severity": "medium",
        }

    except Exception as e:
        logger.error(f"❌ Gemini analysis failed: {e}")
        return {
            "analysis": f"Gemini analysis encountered an error: {str(e)}",
            "justification": "Unable to complete AI analysis.",
            "is_legitimate": False,
            "gemini_classified_type": "unknown",
            "severity": "medium",
        }

    finally:
        # Clean up uploaded file from Gemini
        try:
            client.files.delete(name=video_file.name)
            logger.info(f"🗑️ Cleaned up Gemini file: {video_file.name}")
        except Exception as cleanup_err:
            logger.warning(f"⚠️ Failed to delete Gemini file: {cleanup_err}")
