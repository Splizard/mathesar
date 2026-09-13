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
import subprocess
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import pytest

from mathesar.models import User
from mathesar.utils import certmint
from django.conf import settings as django_settings

from mathesar.utils.agent_onboarding import onboarding_prompt, reference_url, script_url
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


class TestThePrompt:
    """
    The prompt is pasted into somebody's working session, so it is short and carries only what
    is particular to this agent and what must be obeyed before the reference has been read. It
    lands in a context window and from there in a transcript, so what it must not carry matters
    more than what it says.
    """

    def test_the_password_is_never_in_it(self, helper, claude):
        issued = provision_agent_certificate(claude.owner, claude.id, SITE)
        assert issued["password"] not in issued["prompt"]

    def test_it_is_short(self, claude):
        assert len(onboarding_prompt(claude, SITE).splitlines()) <= 60

    def test_it_says_why_the_database_is_being_shared(self, claude):
        prompt = flat(onboarding_prompt(claude, SITE))
        assert "because it holds data for the project you are working on together" in prompt
        assert "Use it for that work" in prompt

    def test_it_names_the_agent_and_this_installation(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert "Quentin's Claude" in prompt
        assert claude.email in prompt
        assert SITE in prompt

    def test_it_points_at_the_public_reference_and_script(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert reference_url() in prompt
        assert f"curl -fsSL {script_url()} -o ~/.config/mathesar/mathesar" in prompt

    def test_the_reference_is_where_the_settings_say(self, claude, settings):
        settings.AGENT_REFERENCE_BASE_URL = "https://example.org/agents/"
        prompt = onboarding_prompt(claude, SITE)
        assert "https://example.org/agents/README.md" in prompt
        assert "https://example.org/agents/mathesar" in prompt

    def test_it_reuses_a_certificate_already_in_its_place(self, claude):
        """Set up once, not every session: look in the one place it lives before anything."""
        prompt = flat(onboarding_prompt(claude, SITE))
        assert "ls quentin-claude.crt quentin-claude.key" in prompt
        assert "-checkend 86400" in prompt
        assert "do not look for a bundle or ask for a password" in prompt

    def test_it_forbids_asking_for_the_password_in_the_conversation(self, claude):
        """
        "Ask the person" is not enough on its own: an agent told that asks in the chat,
        which puts the password in the transcript by a slower route.
        """
        prompt = flat(onboarding_prompt(claude, SITE))
        assert "Never ask for the password in this conversation" in prompt
        assert "Ask them to unpack it themselves" in prompt

    def test_it_writes_the_config_the_script_reads(self, claude):
        prompt = onboarding_prompt(claude, SITE)
        assert f"{SITE} quentin-claude certid > ~/.config/mathesar/quentin-claude.conf" in prompt

    def test_the_config_names_whichever_provider_is_configured(self, claude, settings):
        before = settings.SSO_CONFIG.oidc_apps
        settings.SSO_CONFIG.oidc_apps = [{"provider_id": "elsewhere"}]
        try:
            assert "quentin-claude elsewhere >" in onboarding_prompt(claude, SITE)
        finally:
            settings.SSO_CONFIG.oidc_apps = before

    def test_it_carries_the_rules_that_cannot_wait(self, claude):
        prompt = flat(onboarding_prompt(claude, SITE))
        assert "Ask before deleting anything" in prompt
        assert "never copy, print or commit them" in prompt
        assert "never a secret" in prompt
        assert "say so and stop" in prompt
        assert "do not use anybody else's credentials" in prompt


REFERENCE = Path(django_settings.BASE_DIR) / "docs" / "agents"


class TestTheReference:
    """
    The public page carries what the prompt leaves out. It is the only place an agent learns how
    to get the password past itself, so those parts are checked as closely as the prompt was.
    """

    @pytest.fixture
    def page(self):
        return flat((REFERENCE / "README.md").read_text())

    def test_it_shows_how_to_ask_without_seeing_the_password(self, page):
        assert "with hidden answer" in page  # macOS dialog
        assert "zenity --password" in page
        assert "read -rs" in page
        assert "the person unpacks it themselves" in page

    def test_it_warns_off_the_ways_a_password_leaks(self, page):
        assert "Do not ask for the password in the conversation" in page
        assert "-passin pass:" in page
        assert "shell history" in page
        assert "Delete `.pw` even if a command failed" in page

    def test_it_says_to_store_things_tightly(self, page):
        assert "umask 077" in page
        assert "chmod 700" in page
        assert "chmod 600" in page
        assert "Anyone holding either file is you." in page

    def test_it_says_how_rows_are_keyed(self, page):
        assert "rows are keyed by column id as a string, not by name" in page

    def test_it_says_what_never_to_write_down(self, page):
        assert "Never write down the password" in page

    def test_it_says_what_to_do_when_shut_out(self, page):
        assert "do not use anybody else's credentials" in page
        assert "do not reuse a human's session cookie" in page
        assert "Say what happened and stop." in page

    def test_it_is_about_no_installation_in_particular(self, page):
        assert "hiddenstrings" not in page


class TestTheScript:
    """The script the prompt fetches: generic, told everything by the config the prompt writes."""

    @pytest.fixture
    def script(self):
        return (REFERENCE / "mathesar").read_text()

    def test_it_is_valid_shell(self):
        subprocess.run(["sh", "-n", str(REFERENCE / "mathesar")], check=True)

    def test_it_signs_in_through_the_configured_provider(self, script):
        assert '"$site/auth/oidc/$provider/login/?process=login"' in script
        assert '"$site/api/rpc/v0/"' in script

    def test_it_reads_the_config_rather_than_running_it(self, script):
        assert "sed -n" in script
        assert '. "$conf"' not in script

    def test_it_is_about_no_installation_in_particular(self, script):
        assert "hiddenstrings" not in script
