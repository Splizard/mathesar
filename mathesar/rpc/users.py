"""
Classes and functions exposed to the RPC endpoint for managing mathesar users.
"""
from typing import Optional, TypedDict

from django.conf import settings
from modernrpc.core import REQUEST_KEY

from mathesar.rpc.decorators import mathesar_rpc_method
from mathesar.utils import certmint
from mathesar.utils.users import (
    add_agent,
    delete_agent,
    provision_agent_certificate,
    revoke_agent_certificate,
    get_user,
    list_agents,
    list_users,
    add_user,
    update_self_user_info,
    update_other_user_info,
    delete_user,
    change_password,
    revoke_password
)


class UserInfo(TypedDict):
    """
    Information about a mathesar user.

    Attributes:
        id: The Django id of the user, a UUID.
        username: The username of the user.
        is_superuser: Specifies whether the user is a superuser.
        email: The email of the user.
        full_name: The full name of the user.
        display_language: Specifies the display language for the user, can be either `en` or `ja`.
        owner: The id of the person who set this agent going, and `null` for a person.
        agent_model: Which model is behind an agent, as a label. Empty for a person.
        display_name: What to call this user wherever one is shown. An agent is named by
            its owner as well as itself -- "Quentin's Claude" -- because its own name is
            only unique among its owner's agents.
        has_certificate: Whether this agent has been issued the certificate that lets it in.
        cert_expires_at: When that certificate stops being accepted, ISO 8601, or `null`.
    """
    id: str
    username: str
    is_superuser: bool
    email: str
    full_name: str
    display_language: str
    owner: Optional[str]
    agent_model: str
    display_name: str
    has_certificate: bool
    cert_expires_at: Optional[str]

    @classmethod
    def from_model(cls, model):
        return cls(
            id=str(model.id),
            username=model.username,
            is_superuser=model.is_superuser,
            email=model.email,
            full_name=model.full_name,
            display_language=model.display_language,
            owner=str(model.owner_id) if model.owner_id else None,
            agent_model=model.agent_model,
            display_name=model.display_name,
            has_certificate=model.has_certificate,
            cert_expires_at=(
                model.cert_expires_at.isoformat() if model.cert_expires_at else None
            ),
        )


class UserDef(TypedDict):
    """
    Definition for creating a mathesar user.

    Attributes:
        username: The username of the user.
        password: The password of the user.
        is_superuser: Whether the user is a superuser.
        email: The email of the user.
        full_name: The full name of the user.
        display_language: Specifies the display language for the user, can be set to either `en` or `ja`.
    """
    username: str
    password: str
    is_superuser: bool
    email: Optional[str]
    full_name: Optional[str]
    display_language: Optional[str]


@mathesar_rpc_method(name='users.add')
def add(*, user_def: UserDef) -> UserInfo:
    """
    Add a new mathesar user.

    Args:
        user_def: A dict describing the user to create.

    Privileges:
        This endpoint requires the caller to be a superuser.

    Returns:
        The information of the created user.
    """
    user = add_user(user_def)
    return UserInfo.from_model(user)


@mathesar_rpc_method(name='users.delete')
def delete(*, user_id: str) -> None:
    """
    Delete a mathesar user.

    Args:
        user_id: The Django id of the user to delete.

    Privileges:
        This endpoint requires the caller to be a superuser.
    """
    delete_user(user_id)


@mathesar_rpc_method(name="users.get")
def get(*, user_id: str) -> UserInfo:
    """
    Get information about a mathesar user.

    Args:
        user_id: The Django id of the user.

    Returns:
        User information for a given user_id.
    """
    user = get_user(user_id)
    return UserInfo.from_model(user)


@mathesar_rpc_method(name='users.list')
def list_() -> list[UserInfo]:
    """
    List information about all mathesar users. Exposed as `list`.

    Returns:
        A list of information about mathesar users.
    """
    users = list_users()
    return [UserInfo.from_model(user) for user in users]


@mathesar_rpc_method(name='users.current_ip_address', auth="login")
def current_ip_address(**kwargs) -> Optional[str]:
    """
    The IP address the caller's request came from, to fill an IP column in with.

    Behind a proxy this is the first address of the `X-Forwarded-For` header, which the
    caller could have set themselves; it's only ever offered as a value to write, never
    used to decide anything, so it's no more to be trusted than what they could type.

    Returns:
        The address, or `null` when the request carries none.
    """
    request = kwargs.get(REQUEST_KEY)
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    address = forwarded_for.split(',')[0].strip() or request.META.get('REMOTE_ADDR')
    return address or None


@mathesar_rpc_method(name='users.patch_self', auth="login")
def patch_self(
    *,
    username: str,
    email: str,
    full_name: str,
    display_language: str,
    **kwargs
) -> UserInfo:
    """
    Alter details of currently logged in mathesar user.

    Args:
        username: The username of the user.
        email: The email of the user.
        full_name: The full name of the user.
        display_language: Specifies the display language for the user, can be set to either `en` or `ja`.

    Returns:
        Updated user information of the caller.
    """
    user = kwargs.get(REQUEST_KEY).user
    if settings.REQUIRE_SSO_LOGIN and email != user.email:
        raise Exception('Email cannot be changed when SSO-only login is enabled.')
    updated_user_info = update_self_user_info(
        user_id=user.id,
        username=username,
        email=email,
        full_name=full_name,
        display_language=display_language
    )
    return UserInfo.from_model(updated_user_info)


@mathesar_rpc_method(name='users.patch_other')
def patch_other(
    *,
    user_id: str,
    username: str,
    is_superuser: bool,
    email: str,
    full_name: str,
    display_language: str
) -> UserInfo:
    """
    Alter details of a mathesar user, given its user_id.

    Args:
        user_id: The Django id of the user.
        username: The username of the user.
        is_superuser: Specifies whether to set the user as a superuser.
        email: The email of the user.
        full_name: The full name of the user.
        display_language: Specifies the display language for the user, can be set to either `en` or `ja`.

    Privileges:
        This endpoint requires the caller to be a superuser.

    Returns:
        Updated user information for a given user_id.
    """
    updated_user_info = update_other_user_info(
        user_id=user_id,
        username=username,
        is_superuser=is_superuser,
        email=email,
        full_name=full_name,
        display_language=display_language
    )
    return UserInfo.from_model(updated_user_info)


@mathesar_rpc_method(name='users.password.replace_own', auth="login")
def replace_own(
    *,
    old_password: str,
    new_password: str,
    **kwargs
) -> None:
    """
    Alter password of currently logged in mathesar user.

    Args:
        old_password: Old password of the currently logged in user.
        new_password: New password of the user to set.
    """
    if settings.REQUIRE_SSO_LOGIN:
        raise Exception('Password authentication is disabled when SSO-only login is enabled.')
    user = kwargs.get(REQUEST_KEY).user
    if not user.check_password(old_password):
        raise Exception('Old password is incorrect')
    change_password(user.id, new_password)


@mathesar_rpc_method(name='users.password.revoke')
def revoke(
    *,
    user_id: str,
    new_password: str,
) -> None:
    """
    Alter password of a mathesar user, given its user_id.

    Args:
        user_id: The Django id of the user.
        new_password: New password of the user to set.

    Privileges:
        This endpoint requires the caller to be a superuser.
    """
    revoke_password(user_id, new_password)


@mathesar_rpc_method(name='users.agents.add', auth="login")
def add_agent_(
    *,
    name: str,
    agent_model: str = '',
    email: Optional[str] = None,
    **kwargs
) -> UserInfo:
    """
    Set an agent going, owned by the caller.

    An agent is a user with an owner, so it can be assigned a row through a user column
    and its writes are attributed like anybody else's. It reaches a database exactly as
    far as the person who set it going, and no further.

    Creating one does not let it in: it has no password, and it arrives through the same
    gate its owner does. Whoever runs the installation still has to allow its address --
    and, where the gate asks for a client certificate, issue it one.

    Args:
        name: What to call it. Only has to be unique among the caller's own agents, so
            both people on a shared Mathesar can have a "Claude". Defaults to "Agent".
        agent_model: Which model is behind it, as a label -- "claude", "codex", "qwen".
        email: The address it is known by at the gate, which must be nobody else's.
            Defaults to the caller's own address with the agent's name tagged onto it.

    Returns:
        The information of the created agent.
    """
    owner = kwargs.get(REQUEST_KEY).user
    return UserInfo.from_model(add_agent(owner, name, agent_model, email))


@mathesar_rpc_method(name='users.agents.list', auth="login")
def list_agents_(**kwargs) -> list[UserInfo]:
    """
    List the caller's own agents. Exposed as `list`.

    Returns:
        A list of information about the caller's agents, oldest first.
    """
    owner = kwargs.get(REQUEST_KEY).user
    return [UserInfo.from_model(agent) for agent in list_agents(owner)]


@mathesar_rpc_method(name='users.agents.delete', auth="login")
def delete_agent_(*, agent_id: str, **kwargs) -> None:
    """
    Stop one of the caller's own agents.

    Args:
        agent_id: The Django id of the agent, a UUID.
    """
    owner = kwargs.get(REQUEST_KEY).user
    delete_agent(owner, agent_id)


class AgentCertificate(TypedDict):
    """
    A newly issued certificate, and what to do with it. Returned once and never again.

    Attributes:
        filename: What to save the bundle as.
        bundle: The PKCS#12 bundle, base64 encoded.
        password: The bundle's password. Kept nowhere -- not by Mathesar and not by the
            helper that made it -- so a bundle whose password was lost is reissued rather
            than recovered. It is deliberately absent from `prompt`.
        authority: The certificate authority that signed it, PEM, base64 encoded.
        prompt: Setup instructions written to be handed to the agent itself.
        agent: The agent, with its certificate now recorded.
    """
    filename: str
    bundle: str
    password: str
    authority: str
    prompt: str
    agent: UserInfo


@mathesar_rpc_method(name='users.agents.can_issue_certificates', auth="login")
def can_issue_certificates() -> bool:
    """
    Whether this Mathesar can issue an agent the certificate that lets it in.

    True only where the installation puts a client-certificate gate in front of Mathesar and
    has the helper that holds the authority. Everywhere else an agent is still set going the
    same way; letting it in is then whatever that installation does to let anybody in.

    Returns:
        Whether `users.agents.provision_certificate` will work.
    """
    return certmint.is_available()


@mathesar_rpc_method(name='users.agents.provision_certificate', auth="login")
def provision_certificate(*, agent_id: str, **kwargs) -> AgentCertificate:
    """
    Issue one of the caller's own agents a client certificate, and say how to install it.

    Issuing again replaces what was there. The bundle and its password come back once;
    nothing keeps a copy of the password, so one that is lost means issuing again.

    Args:
        agent_id: The Django id of the agent, a UUID.

    Returns:
        The bundle, its password, and instructions to hand to the agent.
    """
    request = kwargs.get(REQUEST_KEY)
    site_url = f"{request.scheme}://{request.get_host()}"
    issued = provision_agent_certificate(request.user, agent_id, site_url)
    return AgentCertificate(
        filename=issued["filename"],
        bundle=issued["bundle"],
        password=issued["password"],
        authority=issued["authority"],
        prompt=issued["prompt"],
        agent=UserInfo.from_model(issued["agent"]),
    )


@mathesar_rpc_method(name='users.agents.revoke_certificate', auth="login")
def revoke_certificate(*, agent_id: str, **kwargs) -> UserInfo:
    """
    Shut one of the caller's own agents out, leaving the agent itself in place.

    Takes effect at once rather than at the next restart. Use it when a certificate may have
    got somewhere it should not have; the agent keeps its name, its history and the rows
    assigned to it, and can be issued another.

    Args:
        agent_id: The Django id of the agent, a UUID.

    Returns:
        The agent, with its certificate no longer recorded.
    """
    owner = kwargs.get(REQUEST_KEY).user
    return UserInfo.from_model(revoke_agent_certificate(owner, agent_id))
