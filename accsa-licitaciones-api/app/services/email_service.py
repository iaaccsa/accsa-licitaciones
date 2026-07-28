import logging
import os
from html import escape
from typing import Optional

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
    def send_awaiting_approval(
        self, analysis_id: str, user_email: str, admissibility_summary: Optional[dict] = None
    ) -> None:
        if not self._is_allowed(user_email):
            return
        analysis_url = f"{settings.FRONTEND_BASE_URL}/analyses/{analysis_id}"
        block = self._render_admissibility_block(admissibility_summary)
        html = self._render_template(
            "awaiting_approval.html", analysis_url, {"admissibility_block": block}
        )
        self._send(to=user_email, subject="Análisis pendiente de aprobación", html=html)

    def send_pipeline_completed(self, analysis_id: str, user_email: str) -> None:
        if not self._is_allowed(user_email):
            return
        analysis_url = f"{settings.FRONTEND_BASE_URL}/analyses/{analysis_id}"
        html = self._render_template("pipeline_completed.html", analysis_url)
        self._send(to=user_email, subject="Análisis terminado exitosamente", html=html)

    def send_pipeline_failed(self, analysis_id: str, user_email: str) -> None:
        if not self._is_allowed(user_email):
            return
        analysis_url = f"{settings.FRONTEND_BASE_URL}/analyses/{analysis_id}"
        html = self._render_template("pipeline_failed.html", analysis_url)
        self._send(to=user_email, subject="Análisis terminado con errores", html=html)

    def _is_allowed(self, email: str) -> bool:
        return email.endswith(f"@{ALLOWED_EMAIL_DOMAIN}")

    def _render_template(
        self, template_name: str, analysis_url: str, extra: Optional[dict] = None
    ) -> str:
        path = os.path.join(TEMPLATES_DIR, template_name)
        with open(path, "r", encoding="utf-8") as f:
            html = f.read().replace("{{analysis_url}}", analysis_url)
        for key, value in (extra or {}).items():
            html = html.replace("{{" + key + "}}", value)
        return html

    def _render_admissibility_block(self, summary: Optional[dict]) -> str:
        """Build the admitidas/rechazadas HTML injected into awaiting_approval.html."""
        if not summary:
            return ""
        admitidas = summary.get("admitidas") or []
        rechazadas = summary.get("rechazadas") or []
        if not admitidas and not rechazadas:
            return ""

        list_style = "margin:0 0 16px;padding-left:20px;font-size:14px;color:#444444;line-height:1.6;"
        parts = [
            '<hr class="divider" />',
            '<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;">Resultado de admisibilidad</p>',
        ]
        if not admitidas:
            parts.append(
                '<p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#92400e;">'
                'Ninguna propuesta fue admitida.</p>'
            )
        if admitidas:
            items = "".join(f"<li>{escape(name)}</li>" for name in admitidas)
            parts.append(
                f'<p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#166534;">'
                f'Admitidas ({len(admitidas)})</p>'
                f'<ul style="{list_style}">{items}</ul>'
            )
        if rechazadas:
            rows = []
            for r in rechazadas:
                codes = ", ".join(r.get("codes") or [])
                detail = f" - incumple: {escape(codes)}" if codes else ""
                rows.append(f"<li>{escape(r.get('name') or 'Propuesta')}{detail}</li>")
            parts.append(
                f'<p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#991b1b;">'
                f'Rechazadas ({len(rechazadas)})</p>'
                f'<ul style="{list_style}">{"".join(rows)}</ul>'
            )
        return "".join(parts)

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
