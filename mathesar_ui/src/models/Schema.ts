import { type Readable, derived, writable } from 'svelte/store';

import { api } from '@mathesar/api/rpc';
import {
  type RawEphemeralDataForm,
  constructRequestToAddForm,
} from '@mathesar/api/rpc/forms';
import type { RawSchema } from '@mathesar/api/rpc/schemas';
import AsyncRpcApiStore from '@mathesar/stores/AsyncRpcApiStore';
import { CancellablePromise, ImmutableMap } from '@mathesar-component-library';

import type { Database } from './Database';
import { DataForm } from './DataForm';
import { ObjectCurrentAccess } from './internal/ObjectCurrentAccess';
import type { Role } from './Role';

export class Schema {
  readonly oid: number;

  private _name;

  get name(): Readable<RawSchema['name']> {
    return this._name;
  }

  private _description;

  get description(): Readable<RawSchema['description']> {
    return this._description;
  }

  private _tableCount;

  get tableCount(): Readable<RawSchema['table_count']> {
    return this._tableCount;
  }

  readonly currentAccess;

  readonly isPublicSchema;

  /**
   * Whether it is one the database or Mathesar keeps for itself. Those are shown so that they can
   * be looked at and never so that they can be changed, so nothing offers to change one -- and
   * the server refuses anything that asks to.
   */
  readonly isInternal: boolean;

  /**
   * Whether things can be added to the schema: the privilege to do it, on a schema that is the
   * user's to change rather than one the database or Mathesar keeps for itself.
   *
   * Changing or dropping what is already in it needs to own that thing, which isn't ours to know,
   * so somebody who can add to the schema is offered all of it and the database has the last word
   * on the rest.
   */
  readonly canBeAddedTo: Readable<boolean>;

  readonly database: Database;

  constructor(props: { database: Database; rawSchema: RawSchema }) {
    this.oid = props.rawSchema.oid;
    this._name = writable(props.rawSchema.name);
    this.isPublicSchema = derived(this._name, ($name) => $name === 'public');
    this._description = writable(props.rawSchema.description);
    this._tableCount = writable(props.rawSchema.table_count);
    this.isInternal = props.rawSchema.internal;
    this.currentAccess = new ObjectCurrentAccess(props.rawSchema);
    this.canBeAddedTo = derived(
      this.currentAccess.currentRolePrivileges,
      ($privileges) => $privileges.has('CREATE') && !this.isInternal,
    );
    this.database = props.database;
  }

  updateNameAndDescription(props: {
    name: string;
    description: RawSchema['description'];
  }): CancellablePromise<Schema> {
    const promise = api.schemas
      .patch({
        database_id: this.database.id,
        schema_oid: this.oid,
        patch: props,
      })
      .run();

    return new CancellablePromise(
      (resolve, reject) => {
        promise
          .then(() => {
            this._name.set(props.name);
            this._description.set(props.description);
            return resolve(this);
          }, reject)
          .catch(reject);
      },
      () => promise.cancel(),
    );
  }

  updateOwner(newOwner: Role['oid']) {
    const promise = api.schemas.privileges
      .transfer_ownership({
        database_id: this.database.id,
        schema_oid: this.oid,
        new_owner_oid: newOwner,
      })
      .run();

    return new CancellablePromise(
      (resolve, reject) => {
        promise
          .then((result) => {
            this.currentAccess.set(result);
            return resolve(this);
          }, reject)
          .catch(reject);
      },
      () => promise.cancel(),
    );
  }

  setTableCount(count: number) {
    this._tableCount.set(count);
  }

  delete(): CancellablePromise<void> {
    return api.schemas
      .delete({
        database_id: this.database.id,
        schema_oids: [this.oid],
      })
      .run();
  }

  constructSchemaPrivilegesStore() {
    return new AsyncRpcApiStore(api.schemas.privileges.list_direct, {
      staticProps: { database_id: this.database.id, schema_oid: this.oid },
      postProcess: (rawSchemaPrivilegesForRoles) =>
        new ImmutableMap(
          rawSchemaPrivilegesForRoles.map((rawSchemaPrivilegesForRole) => [
            rawSchemaPrivilegesForRole.role_oid,
            rawSchemaPrivilegesForRole,
          ]),
        ),
    });
  }

  /** The enums, composite types, and domains defined in the schema */
  constructTypesStore() {
    return new AsyncRpcApiStore(api.schemas.list_types, {
      staticProps: { database_id: this.database.id, schema_oid: this.oid },
    });
  }

  constructDataFormsStore() {
    return new AsyncRpcApiStore(api.forms.list, {
      staticProps: { database_id: this.database.id, schema_oid: this.oid },
      postProcess: (rawDataForms) =>
        new ImmutableMap(
          rawDataForms.map((rawDataForm) => [
            rawDataForm.id,
            new DataForm({ schema: this, rawDataForm }),
          ]),
        ),
    });
  }

  addDataForm(dataFormDef: RawEphemeralDataForm): CancellablePromise<DataForm> {
    const promise = api.forms
      .add(constructRequestToAddForm(this.database.id, dataFormDef))
      .run();

    return new CancellablePromise(
      (resolve, reject) => {
        promise
          .then(
            (rawDataForm) =>
              resolve(
                new DataForm({
                  schema: this,
                  rawDataForm,
                }),
              ),
            reject,
          )
          .catch(reject);
      },
      () => promise.cancel(),
    );
  }
}
