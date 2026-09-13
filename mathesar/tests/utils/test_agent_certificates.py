"""
Test issuing an agent the certificate that lets it in.

The helper that holds the certificate authority is a separate root-owned process on the
appliance, so these tests stand a fake one up on a unix socket and check what Mathesar sends
it, what it records afterwards, and -- the part worth guarding most -- what does and does not
end up in the instructions handed to the agent.
"""
import base64
import json
import socketserver
import threading
from http.server import BaseHTTPRequestHandler

import pytest

from mathesar.models import User
from mathesar.utils import certmint
from mathesar.utils.agent_onboarding import onboarding_prompt
from mathesar.utils.users import (
    add_agent,
    delete_agent,
    provision_agent_certificate,
    revoke_agent_certificate,
)

SITE = "https://my.example.com"


def flat(text):
    """
    The prose with its line breaks flattened.

    The prompt is hard-wrapped for reading, and where a sentence happens to wrap is not
    something a test should care about -- otherwise rewording a paragraph breaks tests that
    were checking the wording was there at all.
    """
    return " ".join(text.split())


class FakeHelper:
    """A stand-in for certmint, listening on a unix socket the way the real one does."""

    def __init__(self, tmp_path, answer=None, status=200):
        self.path = str(tmp_path / "certmint.sock")
        self.asked = []
        self.answer = answer or {
            "serial": "AABBCC",
            "not_after": "2027-01-01T00:00:00+00:00",
            "p12_base64": base64.b64encode(b"a bundle").decode(),
            "password": "correct-horse-battery",
            "ca_base64": base64.b64encode(b"the authority").decode(),
        }
        self.status = status
        helper = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                helper.asked.append((self.path, body))
                payload = json.dumps(helper.answer).encode()
                self.send_response(helper.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        class Server(socketserver.ThreadingUnixStreamServer):
            allow_reuse_address = True

        self.server = Server(self.path, Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def helper(tmp_path, settings):
    h = FakeHelper(tmp_path)
    settings.CERTMINT_SOCKET = h.path
    yield h
    h.stop()


@pytest.fixture
def quentin(db):
    return User.objects.create(
        username="quentin", full_name="Quentin", email="q@example.com"
    )


@pytest.fixture
def claude(quentin):
    return add_agent(quentin, "Claude", "claude")


class TestWhetherItCanBeOffered:
    def test_no_helper_means_no_offer(self, settings):
        settings.CERTMINT_SOCKET = None
        assert certmint.is_available() is False

    def test_a_helper_means_it_can_be_offered(self, helper):
        assert certmint.is_available() is True

    def test_asking_without_one_says_so_rather_than_failing_oddly(self, settings, claude):
        settings.CERTMINT_SOCKET = None
        with pytest.raises(certmint.CertMintUnavailable):
            provision_agent_certificate(claude.owner, claude.id, SITE)


class TestIssuing:
    def test_the_helper_is_asked_for_the_agents_own_address(self, helper, claude):
        provision_agent_certificate(claude.owner, claude.id, SITE)
        path, body = helper.asked[0]
        assert path == "/issue"
        assert body["email"] == claude.email
        assert body["common_name"] == "Quentin's Claude"
        assert body["slug"] == claude.cert_slug

    def test_the_slug_is_one_the_helper_accepts(self, helper, claude):
        """certmint only takes [a-z0-9-], and a username has underscores in it."""
        assert "_" not in claude.cert_slug
        assert claude.cert_slug == "quentin-claude"

    def test_what_comes_back_is_the_bundle_and_how_to_use_it(self, helper, claude):
        issued = provision_agent_certificate(claude.owner, claude.id, SITE)
        assert issued["filename"] == "quentin-claude.p12"
        assert base64.b64decode(issued["bundle"]) == b"a bundle"
        assert issued["password"] == "correct-horse-battery"
        assert "openssl pkcs12" in issued["prompt"]

    def test_the_certificate_is_recorded_but_not_its_password(self, helper, claude):
        provision_agent_certificate(claude.owner, claude.id, SITE)
        claude.refresh_from_db()
        assert claude.has_certificate
        assert claude.cert_serial == "AABBCC"
        assert claude.cert_expires_at is not None
        assert "correct-horse-battery" not in str(claude.__dict__)

    def test_somebody_elses_agent_is_not_yours_to_provision(self, helper, claude, db):
        bligh = User.objects.create(username="bligh", email="b@example.com")
        with pytest.raises(Exception, match="belongs to somebody else"):
            provision_agent_certificate(bligh, claude.id, SITE)
        assert helper.asked == []

    def test_a_helper_that_says_no_leaves_nothing_recorded(self, tmp_path, settings, claude):
        h = FakeHelper(tmp_path, answer={"error": "no"}, status=500)
        settings.CERTMINT_SOCKET = h.path
        try:
            with pytest.raises(certmint.CertMintFailed, match="no"):
                provision_agent_certificate(claude.owner, claude.id, SITE)
        finally:
            h.stop()
        claude.refresh_from_db()
        assert not claude.has_certificate


class TestRevoking:
    def test_revoking_shuts_the_agent_out_but_keeps_it(self, helper, claude):
        provision_agent_certificate(claude.owner, claude.id, SITE)
        revoke_agent_certificate(claude.owner, claude.id)

        path, body = helper.asked[-1]
        assert path == "/revoke"
        assert body == {"slug": claude.cert_slug, "email": claude.email}

        claude.refresh_from_db()
        assert not claude.has_certificate
        assert claude.cert_expires_at is None
        assert User.objects.filter(id=claude.id).exists()

    def test_stopping_an_agent_revokes_first(self, helper, claude):
        """Deleting the row first would leave a certificate that still opens the door."""
        provision_agent_certificate(claude.owner, claude.id, SITE)
        delete_agent(claude.owner, claude.id)

        assert [p for p, _ in helper.asked] == ["/issue", "/revoke"]
        assert not User.objects.filter(id=claude.id).exists()

    def test_stopping_one_that_never_had_a_certificate_asks_nothing(self, helper, claude):
        delete_agent(claude.owner, claude.id)
        assert helper.asked == []

    def test_an_unreachable_helper_stops_the_deletion(self, settings, claude, helper):
        """Better to refuse than to throw away the record of who the certificate admits."""
        provision_agent_certificate(claude.owner, claude.id, SITE)
        settings.CERTMINT_SOCKET = str(claude.id) + "-nothing-here.sock"
        with pytest.raises(certmint.CertMintUnavailable):
            delete_agent(claude.owner, claude.id)
        assert User.objects.filter(id=claude.id).exists()


class TestTheInstructions:
    """
    The prompt is handed to the agent, so it lands in a context window and from there in a
    transcript. What it must not carry matters more than what it says.
    """

    def test_the_password_is_never_in_them(self, helper, claude):
        issued = provision_agent_certificate(claude.owner, claude.id, SITE)
        assert issued["password"] not in issued["prompt"]

    def test_they_say_where_the_password_is_not(self, helper, claude):
        issued = provision_agent_certificate(claude.owner, claude.id, SITE)
        assert "NOT in these instructions" in flat(issued["prompt"])

    def test_they_forbid_asking_for_it_in_the_conversation(self, claude):
        """
        "Ask the person" is not enough on its own: an agent told that asks in the chat,
        which puts the password in the transcript by a slower route.
        """
        prompt = onboarding_prompt(claude, SITE)
        assert "Do not ask for the password in this conversation" in flat(prompt)

    def test_they_show_how_to_ask_without_seeing_it(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "with hidden answer" in prompt  # macOS dialog
        assert "zenity --password" in prompt
        assert "read -rs" in prompt

    def test_they_offer_the_version_where_the_agent_never_sees_it(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "ask THEM to run step 2 themselves" in flat(prompt)

    def test_they_warn_off_the_ways_a_password_leaks(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "-passin pass:" in prompt
        assert "shell history" in flat(prompt)

    def test_they_say_to_delete_the_password_afterwards(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "rm -f .pw" in prompt
        assert "Delete `.pw` even if a command failed" in flat(prompt)

    def test_they_say_to_store_it_somewhere_tight(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "umask 077" in prompt
        assert "chmod 700" in prompt
        assert "chmod 600" in prompt
        assert "security import" in prompt  # the keychain, which is better still

    def test_they_say_to_remember_it_for_next_time(self, claude):
        """An agent walked through this every session is not set up, only set up again."""
        prompt = onboarding_prompt(claude, SITE)
        assert "notes you keep between sessions" in flat(prompt)
        assert "Write down the paths" in flat(prompt)

    def test_they_say_what_never_to_write_down(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "Never write down the password" in flat(prompt)

    def test_they_name_the_agent_and_its_address(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "Quentin's Claude" in flat(prompt)
        assert claude.email in prompt

    def test_they_point_at_this_installation(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert SITE in prompt
        assert "my.example.com" in prompt

    def test_they_say_what_to_do_when_shut_out(self, claude):
        """An agent that loses access should stop, not go looking for another way in."""
        prompt = onboarding_prompt(claude, SITE)
        assert "has been revoked" in flat(prompt)
        assert "do not use anybody else's credentials" in flat(prompt).lower()
        assert "Say what happened and stop." in flat(prompt)

    def test_they_tell_it_to_guard_the_key(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "chmod 600" in prompt
        assert "Anyone holding that file is you." in flat(prompt)
        assert "ask for the certificate to be reissued" in flat(prompt)
