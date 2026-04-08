import logging
import os
import requests

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "email_templates")
FROM_ADDRESS = "accsa-ai@arnaldocastro.com.uy"
MAILGUN_DOMAIN = "arnaldocastro.com.uy"
MAILGUN_API_URL = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages"
ALLOWED_EMAIL_DOMAIN = "arnaldocastro.com.uy"


class EmailService:
    def send_awaiting_approval(self, analysis_id: str, user_email: str) -> None:
        if not self._is_allowed(user_email):
            return
        analysis_url = f"{settings.FRONTEND_BASE_URL}/analyses/{analysis_id}"
        html = self._render_template("awaiting_approval.html", analysis_url)
        self._send(to=user_email, subject="Licitación lista para revisión - ACCSA", html=html)

    def send_pipeline_completed(self, analysis_id: str, user_email: str) -> None:
        if not self._is_allowed(user_email):
            return
        analysis_url = f"{settings.FRONTEND_BASE_URL}/analyses/{analysis_id}"
        html = self._render_template("pipeline_completed.html", analysis_url)
        self._send(to=user_email, subject="Análisis completado - ACCSA", html=html)

    def send_pipeline_failed(self, analysis_id: str, user_email: str) -> None:
        if not self._is_allowed(user_email):
            return
        analysis_url = f"{settings.FRONTEND_BASE_URL}/analyses/{analysis_id}"
        html = self._render_template("pipeline_failed.html", analysis_url)
        self._send(to=user_email, subject="Error en el análisis - ACCSA", html=html)

    def _is_allowed(self, email: str) -> bool:
        return email.endswith(f"@{ALLOWED_EMAIL_DOMAIN}")

    def _render_template(self, template_name: str, analysis_url: str) -> str:
        path = os.path.join(TEMPLATES_DIR, template_name)
        with open(path, "r", encoding="utf-8") as f:
            return f.read().replace("{{analysis_url}}", analysis_url)

    def _send(self, to: str, subject: str, html: str) -> None:
        response = requests.post(
            MAILGUN_API_URL,
            auth=("api", settings.MAILGUN_API_KEY),
            data={"from": FROM_ADDRESS, "to": to, "subject": subject, "html": html},
            timeout=10,
        )
        if not response.ok:
            raise RuntimeError(f"Mailgun returned {response.status_code}: {response.text}")
        logger.info(f"Email sent to {to} | subject: {subject}")


email_service = EmailService()
