"""
Asking the appliance for the certificate that lets an agent in.

Mathesar holds no signing key. Where the installation puts a client-certificate gate in
front of it, a small root-owned helper (`certmint`, in appliance/certmint) holds the CA and
listens on a unix socket that only root and Mathesar's own group can open. Mathesar asks it
for a certificate for an agent, and that is the whole of what it may ask for -- so anything
that got into Mathesar could obtain access for an agent somebody already owns, but could not
mint a person's identity, and could not keep any of it once the agent was stopped.

Where no such helper is configured -- any ordinary installation, and every development
machine -- `is_available()` is false and the buttons that would use it are not offered.
"""

import http.client
import json
import socket

from django.conf import settings


class CertMintUnavailable(Exception):
    """Raised when this installation has no certificate helper to ask."""


class CertMintFailed(Exception):
    """Raised when the helper was asked and said no."""


def socket_path():
    """Where the helper listens, or None where this installation has no gate."""
    return getattr(settings, "CERTMINT_SOCKET", None) or None


def is_available():
    return socket_path() is not None


class _UnixConnection(http.client.HTTPConnection):
    """http.client over a unix socket, which is all the helper speaks."""

    def __init__(self, path, timeout=30):
        super().__init__("localhost", timeout=timeout)
        self._path = path

    def connect(self):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self._path)
        self.sock = sock


def _ask(endpoint, payload):
    path = socket_path()
    if path is None:
        raise CertMintUnavailable(
            "This Mathesar has no certificate helper, so it cannot issue one. An agent can "
            "still be set going; letting it in is then whatever your installation does to "
            "let anybody in."
        )
    conn = _UnixConnection(path)
    try:
        conn.request(
            "POST", endpoint,
            body=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        response = conn.getresponse()
        raw = response.read()
    except OSError as error:
        raise CertMintUnavailable(f"Could not reach the certificate helper: {error}")
    finally:
        conn.close()

    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        raise CertMintFailed(f"The certificate helper answered with {raw[:200]!r}")
    if response.status != 200:
        raise CertMintFailed(body.get("error") or f"status {response.status}")
    return body


def issue(*, slug, common_name, email):
    """
    Issue a client certificate for an agent.

    Returns the bundle and its password. Neither is kept: the helper forgets the password
    as soon as it has answered, and Mathesar never writes it down, so a bundle whose
    password was lost is reissued rather than recovered.
    """
    return _ask("/issue", {"slug": slug, "common_name": common_name, "email": email})


def revoke(*, slug, email):
    """
    Shut an agent out.

    With the gate trusting the certificate authority rather than each certificate by name,
    taking the address off the helper's allow-list is what revoking means -- and the
    identity service reads that list afresh on every sign-in, so it takes effect at once
    rather than at the next restart.
    """
    return _ask("/revoke", {"slug": slug, "email": email})
