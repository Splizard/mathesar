"""
Agents: the users a person sets going to work rows on their behalf.

An agent is a Mathesar user with an owner. That one field carries the whole design: the
user column already assigns work to it, the user-tracking trigger already attributes its
writes, and `User.database_principal` already says it reaches Postgres as its owner and no
further. What is left, and what lives here, is what to call one.

A name only has to be unique among its owner's agents, so both Quentin and Bligh can have
a "Claude" without either being made to pick again. What makes them tell apart on the page
is the owner: "Quentin's Claude", "Bligh's Agent". The possessive is applied when a name is
shown rather than stored, so that renaming a person renames their agents with them.
"""

import re

from django.conf import settings
from django.utils.translation import gettext as _

from mathesar.models import User

#: What an agent is called when the person setting it going does not say.
DEFAULT_AGENT_NAME = "Agent"


def person_label(user):
    """What to call a person: their name if they gave one, and their username otherwise."""
    return (user.full_name or "").strip() or user.username


def display_name(user):
    """
    What to call a user wherever one is shown.

    A person is their own name. An agent is its owner's name and then its own, because an
    agent's name is only unique among its owner's and "Claude" on its own would name two
    different agents on a Mathesar two people share.

    The possessive is applied here rather than by whoever is looking, so that a cell holding
    an agent reads the same to everybody -- a screenshot of a table should mean the same
    thing to the person it is sent to. The picker is where it is shortened for the person
    whose agent it is, because a picker is personal and a stored value is not.
    """
    own_label = person_label(user)
    if not user.is_agent:
        return own_label
    return _("%(owner)s's %(agent)s") % {
        "owner": person_label(user.owner),
        "agent": own_label,
    }


def _slug(name):
    """A name reduced to what a username and a Postgres role may be made of."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return slug or "agent"


def derive_username(owner, name):
    """
    The globally unique handle behind an agent's per-owner name.

    A username is unique across Mathesar and doubles as a Postgres role name, both of which
    cap at 63 characters, so the owner's handle and the agent's name are joined and cut to
    fit. Nobody is shown this; `display_name` is what a person reads.
    """
    stem = f"{owner.username}__{_slug(name)}"[:63]
    candidate = stem
    suffix = 2
    while User.objects.filter(username=candidate).exists():
        tail = f"_{suffix}"
        candidate = f"{stem[:63 - len(tail)]}{tail}"
        suffix += 1
    return candidate


def derive_email(owner, name):
    """
    The identifier an agent is known by at the door.

    Where Mathesar sits behind a gate that works out who somebody is from a client
    certificate -- this fork's appliance does, and SSO generally merges accounts by email --
    identity arrives shaped like an email address. So an agent needs one of its own: sharing
    its owner's would make the two of them the same person to everything upstream of
    Mathesar, which is exactly the telling-apart that owning an agent is for.

    It is **not a mailbox**. Nothing is ever sent to it, and it would be wrong to invent one
    on somebody's real domain: that implies a mailbox that does not exist, might collide
    with one that does, and would quietly start delivering somewhere if the domain ever grew
    a catch-all. So it is built on a domain that cannot be registered by anybody -- RFC 2606
    reserves `.invalid` for exactly this -- and it reads, to anyone who sees it, as the
    identifier it is rather than an address somebody forgot to check.

    An installation whose identity provider insists on a domain it recognises can point
    AGENT_EMAIL_DOMAIN at one it owns, and any agent can be given a particular address
    instead when it is set going.
    """
    domain = getattr(settings, "AGENT_EMAIL_DOMAIN", None) or "agents.invalid"
    return f"{_slug(owner.username)}-{_slug(name)}@{domain}"
