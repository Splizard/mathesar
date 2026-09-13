"""
Classes and functions exposed to the RPC endpoint for managing mathesar users.
"""
from typing import Optional, TypedDict

from django.conf import settings
from modernrpc.core import REQUEST_KEY

from mathesar.rpc.decorators import mathesar_rpc_method
from mathesar.utils.agents import display_name
from mathesar.utils.users import (
    add_agent,
    delete_agent,
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
            display_name=display_name(model),
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
