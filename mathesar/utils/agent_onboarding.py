"""
The instructions handed to an agent once it has a certificate.

The point of this file is that setting an agent going should end with something a person can
paste to their agent, rather than with a certificate and a shrug. What comes back is written
to be read by the agent itself.

Two rules shape all of it.

**The password never appears here.** It is shown once, to the person, in the browser. In this
text it would travel into the agent's context and from there into a transcript, a log, and
whatever the agent quotes back -- and a password that has been in a transcript is not a
password any more.

**Saying "ask the person for it" is not enough**, because an agent told that will ask in the
conversation, which puts it in the transcript by a slower route. So the instructions say how
to ask: through a hidden prompt the person types into directly, with the answer going
straight to openssl and never through the agent's own reasoning. Better still, they offer
the version where the person does the one-time conversion themselves and the agent never
sees the password at all.

The last section is about what to remember. An agent that has to be walked through this every
session is not set up, it is set up repeatedly -- so it is told what to write down (where the
key is, who it is, how to call) and, just as firmly, what never to write down.
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
    home = "~/.config/mathesar"
    return f"""\
You have been given your own access to Mathesar, as "{agent.display_name}".

You are a collaborator there in your own right, not a borrowed login. Work you do is
recorded against you, and you can be assigned rows through a User column the way a person
can. You reach exactly the databases your owner reaches, and nothing further.

    site:       {site_url}
    you are:    {agent.email}
    your key:   {home}/{slug}.key (after step 2)

## 1. Getting the password, without putting it in this conversation

{host} asks every caller for a client certificate.
You have been issued one of your own, in a file called
{bundle}. It is encrypted, and the password is NOT in
these instructions on purpose.

**Do not ask for the password in this conversation.** Anything typed to you here is in your
context, and from there in a transcript, a log, and anything you quote back. Ask for it in a
way that goes past you instead.

The best option, if the person is at the machine: ask THEM to run step 2 themselves, in
their own terminal, and tell you when the files exist. You never see the password at all,
and nothing is lost by it.

If you must collect it yourself, use a hidden prompt and send the answer straight to a file
that openssl reads, never into a variable you print, a command line, or your own reasoning:

    umask 077
    mkdir -p {home} && cd {home}
    # macOS: a real dialog box, with the typing hidden
    osascript -e 'display dialog "Mathesar bundle password" default answer "" \\
      with hidden answer' -e 'text returned of result' > .pw
    # Linux with zenity:   zenity --password > .pw
    # Anywhere with a tty: read -rs -p "Mathesar bundle password: " p && printf %s "$p" > .pw && unset p

Never `echo` it, never pass it as `-passin pass:...` (that lands in the process list and in
shell history), and never keep it after step 2.

## 2. Installing the certificate

    umask 077
    mkdir -p {home} && chmod 700 {home}
    mv {bundle} {home}/
    cd {home}

    openssl pkcs12 -in {slug}.p12 -clcerts -nokeys \\
      -out {slug}.crt -passin file:.pw
    openssl pkcs12 -in {slug}.p12 -nocerts -nodes \\
      -out {slug}.key -passin file:.pw

    rm -f .pw {slug}.p12          # the password, and the bundle that needed it
    chmod 600 {slug}.key
    chmod 644 {slug}.crt

Delete `.pw` even if a command failed. If you are on a machine with a keychain, importing
the bundle there instead is better still -- on macOS, `security import {slug}.p12
-k ~/Library/Keychains/login.keychain-db` prompts for the password itself and you never
handle it.

`{slug}.key` is now the secret, and it is not password-protected. **Anyone holding that file
is you.** Never copy it into a repository, a container image, a prompt, a pastebin, an issue,
or anywhere a backup or a sync folder might pick it up. Never read its contents aloud. If you
think it has been somewhere it should not have, say so and ask for the certificate to be
reissued -- that revokes the old one.

## 3. Checking it worked

    curl -sS -o /dev/null -w '%{{http_code}}\\n' \\
         --cert {home}/{slug}.crt \\
         --key {home}/{slug}.key \\
         {site_url}/

Any HTTP status at all means your certificate was accepted: the gate refuses the connection
before HTTP begins, so a number here is the proof. `000`, a connection reset, or a TLS error
means the certificate is not being sent or not being accepted -- check the two paths above
before anything else.

Leave the `--cert` and `--key` off and you should get nothing back. That is the gate working.

## 4. What you cannot do yet

You can reach the site, and it knows who you are. **You cannot call the JSON-RPC API from a
script yet.** The API wants a browser session, which is obtained through a sign-in flow that
curl cannot walk through on its own, and you have no password to fall back on -- by design,
since a password would be a second way in that nobody is watching.

Closing that gap is the next piece of work: Mathesar will authenticate you from the
certificate you are already presenting, and then everything below becomes available. Until it
lands, do not try to work around this. Specifically: do not ask anybody for their password,
do not reuse a human's session cookie, and do not look for another route in. If you are asked
to do something that needs the API, say that agent API access is not finished yet.

## 5. Writing it down for next time

Put this in whatever notes you keep between sessions, so nobody has to walk you through it
again:

    Mathesar at {site_url}, as "{agent.display_name}" ({agent.email}).
    Client certificate required on every request:
      --cert {home}/{slug}.crt
      --key  {home}/{slug}.key
    JSON-RPC at {site_url}/api/rpc/v0/

Write down the paths. **Never write down the password, the contents of the key, or anything
you had to unlock to get them.** Notes get read, synced, and shared; the paths are useless to
anyone without the file, and the password would not be.

If the certificate is ever reissued, only the files change -- the paths above stay right.

## 6. Using it, once the gap above is closed

Mathesar speaks JSON-RPC at {site_url}/api/rpc/v0/, and you will send the certificate with
every request. Useful methods to start from: `databases.configured.list`, `schemas.list`,
`tables.list`, `records.list`, `records.patch`. Each takes named params; `tables.list` wants
a `database_id` and a `schema_oid`.

## 7. If you stop being let in

A certificate that stops being accepted has been revoked -- someone stopped you
deliberately, or it expired. Do not look for another way in, do not use anybody else's
credentials, and do not reuse a certificate you were told to replace. Say what happened and
stop.
"""
