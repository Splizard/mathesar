from django.conf import settings
from django.db import transaction

from mathesar.models import User
from mathesar.utils.agents import DEFAULT_AGENT_NAME, derive_email, derive_username
from mathesar.utils.permissions import set_up_home_role_and_db_for_user


def get_user(user_id):
    return User.objects.get(id=user_id)


def list_users():
    return User.objects.all()


@transaction.atomic
def add_user(user_def):
    user = User.objects.create(
        username=user_def["username"],
        is_superuser=user_def["is_superuser"],
        email=user_def.get("email", ""),
        full_name=user_def.get("full_name", ""),
        display_language=user_def.get("display_language", "en"),
        password_change_needed=True
    )
    user.set_password(user_def["password"])
    user.save()
    if settings.PER_USER_DATABASES_ENABLED is True:
        set_up_home_role_and_db_for_user(user)
    return user


def update_self_user_info(user_id, username, email, full_name, display_language):
    User.objects.filter(id=user_id).update(
        username=username,
        email=email,
        full_name=full_name,
        display_language=display_language
    )
    return get_user(user_id)


def update_other_user_info(user_id, username, is_superuser, email, full_name, display_language):
    if is_superuser and get_user(user_id).is_agent:
        raise Exception(
            "An agent cannot be a superuser. It reaches a database as far as the person "
            "who set it going, but administering Mathesar is not delegated."
        )
    User.objects.filter(id=user_id).update(
        username=username,
        is_superuser=is_superuser,
        email=email,
        full_name=full_name,
        display_language=display_language
    )
    return get_user(user_id)


def delete_user(user_id):
    User.objects.get(id=user_id).delete()


def change_password(user_id, new_password):
    user = get_user(user_id)
    user.set_password(new_password)
    user.password_change_needed = False
    user.save()


def revoke_password(user_id, new_password):
    user = get_user(user_id)
    if user.is_agent:
        raise Exception(
            "An agent has no password to set. It authenticates by a token it is handed, "
            "and a password on it would be a second way in that nobody is watching."
        )
    user.set_password(new_password)
    user.password_change_needed = True
    user.save()


@transaction.atomic
def add_agent(owner, name, agent_model, email=None):
    """
    Set an agent going for a person.

    The agent gets no password at all rather than one nobody knows: it arrives the way its
    owner does, through whatever gate the installation puts in front of Mathesar, and a
    usable password on it would be a second way in that nobody is watching.

    It does get an address of its own, because that gate is generally what an address is
    for: SSO merges an account by email, and this fork's appliance works out who is knocking
    from the email in their client certificate. Giving the agent its owner's address would
    make the two of them one person to everything upstream of Mathesar. The agent still
    cannot be signed into until somebody issues it a certificate and allows its address --
    two deliberate acts by whoever runs the installation.
    """
    if owner.is_agent:
        raise Exception(
            "An agent cannot own an agent. Whatever an agent runs internally is its own "
            "business, and Mathesar only knows the person who set it going."
        )
    name = (name or "").strip() or DEFAULT_AGENT_NAME
    if owner.agents.filter(full_name=name).exists():
        raise Exception(f"You already have an agent called {name}.")
    email = (email or "").strip().lower() or derive_email(owner, name)
    if User.objects.filter(email__iexact=email).exists():
        raise Exception(
            f"{email} already belongs to somebody. An agent needs an address of its own, "
            "because that is what says which of you is knocking."
        )
    agent = User.objects.create(
        username=derive_username(owner, name),
        full_name=name,
        owner=owner,
        agent_model=(agent_model or "").strip(),
        is_superuser=False,
        email=email,
        display_language=owner.display_language,
    )
    agent.set_unusable_password()
    agent.save()
    return agent


def list_agents(owner):
    """A person's own agents, oldest first, which is the order they were thought of in."""
    return owner.agents.order_by("date_joined")


def delete_agent(owner, agent_id):
    """Stop one of your own agents. Somebody else's is not yours to stop."""
    agent = User.objects.get(id=agent_id)
    if agent.owner_id != owner.id:
        raise Exception("That agent belongs to somebody else.")
    agent.delete()
