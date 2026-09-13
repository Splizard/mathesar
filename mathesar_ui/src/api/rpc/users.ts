import type { Language } from '@mathesar/i18n/languages/utils';
import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';

export interface BaseUser {
  readonly full_name: string | null;
  readonly email: string | null;
  readonly username: string;
  readonly display_language: Language;
}

interface UserDef extends BaseUser {
  readonly password: string;
  readonly is_superuser: boolean;
}

export interface User extends BaseUser {
  readonly id: string;
  readonly is_superuser: boolean;
  /**
   * The person who set this agent going, and null for a person. An agent is a user with
   * an owner, so everything that already picks, names and attributes a user works on one.
   */
  readonly owner: string | null;
  /** Which model is behind an agent, as a label. Empty for a person. */
  readonly agent_model: string;
  /**
   * What to call this user wherever one is shown. An agent's own name is only unique among
   * its owner's agents, so the server names it by its owner too: "Quentin's Claude".
   */
  readonly display_name: string;
}

export const users = {
  list: rpcMethodTypeContainer<void, User[]>(),

  get: rpcMethodTypeContainer<{ user_id: User['id'] }, User>(),

  add: rpcMethodTypeContainer<{ user_def: UserDef }, User>(),

  delete: rpcMethodTypeContainer<{ user_id: User['id'] }, void>(),

  patch_self: rpcMethodTypeContainer<BaseUser, User>(),

  /** The IP address the caller's request came from, or null when there's none */
  current_ip_address: rpcMethodTypeContainer<void, string | null>(),

  patch_other: rpcMethodTypeContainer<
    Partial<Omit<User, 'id'>> & { user_id: User['id'] },
    User
  >(),

  agents: {
    /** The caller's own agents, oldest first */
    list: rpcMethodTypeContainer<void, User[]>(),

    add: rpcMethodTypeContainer<
      {
        name: string;
        agent_model?: string;
        /** Defaults to the caller's address with the agent's name tagged onto it */
        email?: string;
      },
      User
    >(),

    delete: rpcMethodTypeContainer<{ agent_id: User['id'] }, void>(),
  },

  password: {
    replace_own: rpcMethodTypeContainer<
      {
        old_password: string;
        new_password: string;
      },
      void
    >(),

    revoke: rpcMethodTypeContainer<
      {
        user_id: User['id'];
        new_password: string;
      },
      void
    >(),
  },
};
