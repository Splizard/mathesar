"""
The instructions handed to an agent once it has a certificate.

The point of this file is that setting an agent going should end with something a person can
drop into any AI session -- Claude Code, Codex, Cursor, whatever has a terminal -- and have
that session come out the other end reading and writing the database as itself.

It is deliberately short. A prompt is pasted into somebody's working session, where every line
of it competes with the work they were doing, so it carries only what is particular to this
agent and what must be obeyed before anything else is read: why it has been given the database,
who it is, where its files are, and the handful of rules. Everything else -- the password
options, the API, troubleshooting -- is on a public reference page (docs/agents/README.md), and
the script it calls Mathesar with sits beside that page. Both have to be readable before the
agent has a certificate installed, which is why they are not served by Mathesar, where the
certificate gate would stand in front of them.

Three rules survive the cut, because they cannot wait until the reference has been read.

**The password never appears here**, and the agent is told never to ask for it in the
conversation. The prompt goes into an agent's context and from there into a transcript and a
log; a password that has been through one is spent.

**A certificate already in its place is reused.** It lives in one well-known directory, so any
session can find it, and the first thing the prompt has the agent do is look there. An agent set
up every session is not set up, only set up repeatedly.

**It says why the database is being shared** -- because it holds data for the work the agent and
its person are doing together -- which is what tells the agent what it is there for and how far
to go.
"""

from django.conf import settings

HOME = "~/.config/mathesar"


def bundle_filename(agent):
    """What the downloaded bundle is called, which the instructions then refer to."""
    return f"{agent.cert_slug}.p12"


def sign_in_provider():
    """
    The single sign-on provider an agent signs in through.

    An agent has no password, so the only way it gets a session is the OIDC provider that reads
    its certificate. On the appliance that is certid, which is also what it is called when no
    provider is configured at all -- in which case the sign-in will not work, but the prompt
    is still pointing at the right thing to set up.
    """
    apps = settings.SSO_CONFIG.oidc_apps
    return apps[0]["provider_id"] if apps else "certid"


def reference_url():
    """The public page an agent reads for everything the prompt leaves out."""
    return f"{settings.AGENT_REFERENCE_BASE_URL.rstrip('/')}/README.md"


def script_url():
    """Where the agent fetches the script it calls Mathesar with."""
    return f"{settings.AGENT_REFERENCE_BASE_URL.rstrip('/')}/mathesar"


def onboarding_prompt(agent, site_url):
    """
    What to paste to the agent.

    Args:
        agent: the agent user, already issued a certificate.
        site_url: where this Mathesar answers, e.g. https://my.hiddenstrings.com
    """
    site_url = site_url.rstrip("/")
    slug = agent.cert_slug
    home = HOME
    return f"""\
# Mathesar access for {agent.display_name}

The person you are working with is sharing their Mathesar database with you because it holds
data for the project you are working on together. Use it for that work -- look things up, and
keep rows up to date as the work moves along. It is live data other people rely on.

    site:       {site_url}
    you are:    {agent.display_name} ({agent.email}); what you change is recorded against you
    your files: {home}/{slug}.crt, .key, .conf and the script `mathesar`
    reference:  {reference_url()}

You need a shell with `curl` and `openssl`; without one, say so and stop. The reference has the
detail for every step below.

## 1. Reuse your certificate if you already have it

    cd {home} && ls {slug}.crt {slug}.key && openssl x509 -in {slug}.crt -noout -checkend 86400

`Certificate will not expire`: skip to step 3, and do not look for a bundle or ask for a password.
Anything else: do step 2.

## 2. Install it (first time, or after a reissue)

The person has a bundle, `{bundle_filename(agent)}`, and its password. **Never ask for the
password in this conversation** -- it would end up in your transcript. Ask them to unpack it
themselves, or collect it through a hidden prompt; the reference has the commands for both
("Installing the certificate"). The files go at the paths above.

## 3. Connect

    umask 077 && mkdir -p {home} && chmod 700 {home}
    printf 'site=%s\\nagent=%s\\nprovider=%s\\n' {site_url} {slug} {sign_in_provider()} > {home}/{slug}.conf
    curl -fsSL {script_url()} -o {home}/mathesar && chmod 700 {home}/mathesar
    {home}/mathesar databases.configured.list

A list of databases means you are in; the script signs itself in with your certificate. The
reference ("Finding your way around") shows how to find tables and read and change rows. If it
is not clear which tables belong to this work, ask.

## Rules

- Ask before deleting anything or changing more than a handful of rows. Change tables and columns
  only when asked.
- `{slug}.key` and the `.session` file beside it are you: never copy, print or commit them.
- In your notes for next session, keep the site, who you are and the paths -- never a secret.
- If you are refused or lack a permission, say so and stop. Do not look for another way in, and
  do not use anybody else's credentials.
"""
