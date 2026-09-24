import os
import pyotp
import hashlib
import secrets
from cryptography.fernet import Fernet
import logging

logger = logging.getLogger(__name__)

# Retrieve encryption key from environment, or use a dummy for local dev if missing
TOTP_ENCRYPTION_KEY_B64 = os.getenv("TOTP_ENCRYPTION_KEY")
dummy_key = b'X' * 43 + b'='

def _get_fernet() -> Fernet:
    global TOTP_ENCRYPTION_KEY_B64
    if not TOTP_ENCRYPTION_KEY_B64:
        logger.warning("TOTP_ENCRYPTION_KEY not set. Using dummy key.")
        return Fernet(dummy_key)
    
    try:
        return Fernet(TOTP_ENCRYPTION_KEY_B64.encode('utf-8'))
    except Exception as e:
        logger.error(f"Invalid TOTP_ENCRYPTION_KEY provided: {e}. Falling back to dummy key.")
        TOTP_ENCRYPTION_KEY_B64 = dummy_key.decode('utf-8')
        return Fernet(dummy_key)

fernet = _get_fernet()



def generate_totp_secret() -> str:
    """Generate a random base32 string for a new TOTP secret."""
    return pyotp.random_base32()

def get_totp_uri(secret: str, email: str, issuer_name: str = "MovieRec") -> str:
    """Generate the otpauth:// URI used by authenticator apps to display QR codes."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer_name)

def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code against the plaintext base32 secret."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code)

def encrypt_secret(plain_secret: str) -> str:
    """Encrypt the base32 secret for safe database storage."""
    return fernet.encrypt(plain_secret.encode('utf-8')).decode('utf-8')

def decrypt_secret(encrypted_secret: str) -> str:
    """Decrypt the secret from the database back to base32."""
    return fernet.decrypt(encrypted_secret.encode('utf-8')).decode('utf-8')

def generate_recovery_codes(num_codes: int = 8, code_length: int = 10) -> list:
    """Generate secure one-time recovery codes."""
    codes = []
    for _ in range(num_codes):
        # Create a random hex string or secure alphanumeric string
        code = secrets.token_hex(code_length // 2)
        codes.append(code)
    return codes
