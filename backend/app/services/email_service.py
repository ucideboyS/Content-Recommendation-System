import os
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """
    Abstract layer for sending emails. 
    Can be integrated with SendGrid, Resend, AWS SES, or SMTP later.
    """
    
    def __init__(self):
        self.provider = os.getenv("EMAIL_PROVIDER", "dummy")
        self.api_key = os.getenv("EMAIL_PROVIDER_API_KEY", "")
        self.from_email = os.getenv("EMAIL_FROM", "noreply@movierec.com")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    def send_password_reset_email(self, to_email: str, reset_token: str):
        """
        Send a password reset email containing the unique token.
        """
        reset_link = f"{self.frontend_url}/reset-password?token={reset_token}"
        
        # Determine HTML / text body
        subject = "Password Reset Request"
        body = f"""
        Hello,

        We received a request to reset your password. If you didn't make this request, you can ignore this email.
        Otherwise, you can reset your password using the link below:

        {reset_link}

        This link will expire in 15 minutes.
        """

        if self.provider.lower() == "dummy":
            # For local development / testing without a real provider configured
            logger.info(f"--- DUMMY EMAIL SENT ---")
            logger.info(f"To: {to_email}")
            logger.info(f"Subject: {subject}")
            logger.info(f"Link: {reset_link}")
            logger.info(f"------------------------")
            return True
            
        elif self.provider.lower() == "sendgrid":
            # Example placeholder for real implementation
            pass
            
        else:
            logger.warning(f"Unknown email provider: {self.provider}. Not sending real email.")
            return False

email_service = EmailService()
