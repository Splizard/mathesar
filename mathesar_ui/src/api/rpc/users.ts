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
  /** Whether this agent has been issued the certificate that lets it in */
  readonly has_certificate: boolean;
  /** When that certificate stops being accepted, ISO 8601, or null */
  readonly cert_expires_at: string | null;
}

/** A newly issued certificate and what to do with it. Returned once and never again. */
export interface AgentCertificate {
  readonly filename: string;
  /** The PKCS#12 bundle, base64 encoded */
  readonly bundle: string;
  /**
   * The bundle's password. Kept nowhere once this response is gone, and deliberately not
   * part of `prompt` -- a password that has been through an agent's context is spent.
   */
  readonly password: string;
  /** The certificate authority that signed it, PEM, base64 encoded */
  readonly authority: string;
  /** Setup instructions written to be handed to the agent itself */
  readonly prompt: string;
  readonly agent: User;
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

    /** Whether this installation can issue an agent the certificate that lets it in */
    can_issue_certificates: rpcMethodTypeContainer<void, boolean>(),

    provision_certificate: rpcMethodTypeContainer<
      { agent_id: User['id'] },
      AgentCertificate
    >(),

    revoke_certificate: rpcMethodTypeContainer<
      { agent_id: User['id'] },
      User
    >(),

    /**
     * The instructions to paste to an agent that already has its certificate, without issuing
     * anything. Given a table, they say where to start.
     */
    prompt: rpcMethodTypeContainer<
      {
        agent_id: User['id'];
        table?: {
          database_id: number;
          database_name: string;
          schema_name: string;
          table_oid: number;
          table_name: string;
        };
      },
      string
    >(),
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
