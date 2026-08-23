"""Envío real de email (P2, S16) — antes `seguridad/router.py` solo devolvía
el token de verificación en la respuesta HTTP porque "no hay correo real que
lo transporte" (comentario original en `registro()`). Ahora sí lo hay: SMTP
real contra Mailpit (docker-compose, sin auth), inspeccionable en
http://localhost:8025. `enviar()` nunca lanza — un email que falla no debe
tumbar el registro/login de un usuario real, mismo criterio de "no bloquear
el flujo principal por un efecto secundario" que ya aplica `audit.record`.
"""

import logging
import smtplib
from email.message import EmailMessage

from core.config import SMTP_FROM, SMTP_HOST, SMTP_PORT

logger = logging.getLogger(__name__)


def enviar(destinatario: str, asunto: str, cuerpo: str) -> bool:
    msg = EmailMessage()
    msg["From"]    = SMTP_FROM
    msg["To"]      = destinatario
    msg["Subject"] = asunto
    msg.set_content(cuerpo)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as smtp:
            smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as e:
        logger.warning("No se pudo enviar email a %s: %s", destinatario, e)
        return False
