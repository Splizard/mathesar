"""
The instructions handed to an agent once it has a certificate.

The point of this file is that setting an agent going should end with something a person can
paste to their agent, rather than with a certificate and a shrug. What comes back is written
to be read by the agent itself.

One rule shapes all of it: **the password never appears here**. The bundle's password is
shown once, to the person, in the browser. If it were in this text it would travel into the
agent's context and from there into a transcript, a log, and whatever the agent quotes back
-- and a password that has been in a transcript is not a password any more. So the prompt
says where the password will be and leaves putting it there to the person.
"""

from urllib.parse import urlsplit


def bundle_filename(agent):
    """What the downloaded bundle is called, which the instructions then refer to."""
    return f"{agent.cert_slug}.p12"


def onboarding_prompt(agent, site_url):
    """
    What to paste to the agent.

    Args:
        agent: the agent user, already issued a certificate.
        site_url: where this Mathesar answers, e.g. https://my.hiddenstrings.com
    """
    host = urlsplit(site_url).netloc or site_url
    bundle = bundle_filename(agent)
    slug = agent.cert_slug
    return f"""\
You have been given your own access to Mathesar at {site_url}, as "{agent.display_name}".

You are a collaborator there in your own right, not a borrowed login. Work you do is
recorded against you, and you can be assigned rows through a User column the way a person
can. You reach exactly the databases your owner reaches, and nothing further.

## Getting in

This Mathesar asks every caller for a client certificate, at
{host}. You have been issued one of your own, and it identifies you as
{agent.email}. Without it you will not reach a login
page -- the connection is refused before HTTP begins.

You have been given a PKCS#12 bundle holding your certificate and its private key, called
{bundle}. It is encrypted. The password is NOT in these
instructions, on purpose: ask the person who set you going for it, and do not repeat it
back, log it, or write it into a file that is not listed below.

Set yourself up once:

    mkdir -p ~/.config/mathesar && chmod 700 ~/.config/mathesar
    mv {bundle} ~/.config/mathesar/
    cd ~/.config/mathesar

    # Split the bundle into the two files command-line tools want. Both commands will
    # ask for the bundle password.
    openssl pkcs12 -in {slug}.p12 -clcerts -nokeys -out {slug}.crt
    openssl pkcs12 -in {slug}.p12 -nocerts -nodes -out {slug}.key

    chmod 600 {slug}.key {slug}.p12
    chmod 644 {slug}.crt

Treat {slug}.key as the secret it is. Anyone holding it is you. Never copy it into a
repository, a container image, a prompt, or anywhere a backup might pick it up.

## Checking it worked

    curl --cert ~/.config/mathesar/{slug}.crt \\
         --key ~/.config/mathesar/{slug}.key \\
         {site_url}/api/rpc/v0/ \\
         -H 'Content-Type: application/json' \\
         -d '{{"jsonrpc":"2.0","id":1,"method":"users.current_ip_address","params":{{}}}}'

A JSON answer means the certificate is accepted. A connection reset or a TLS error means it
is not being sent -- check the paths above before anything else.

## Using it

Mathesar speaks JSON-RPC, at
{site_url}/api/rpc/v0/
Send the certificate with every request. Useful methods to start from:
`databases.configured.list`, `schemas.list`, `tables.list`, `records.list`,
`records.patch`. Each takes named params; `tables.list` wants a `database_id` and a
`schema_oid`.

## What to do if something goes wrong

If your certificate stops being accepted, it has been revoked -- someone stopped you
deliberately. Do not try to get in another way, and do not use anybody else's credentials.
Say so and stop.
"""
