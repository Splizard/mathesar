import type { UserTableView } from '@mathesar/api/rpc/tables';

import type { TableRef } from './userTableView';

const settleMs = 1000;

/**
 * Keeps what somebody has on as they change it.
 *
 * The first view noted for a table is what it was opened with, and is not kept -- it is already
 * either what was kept or what a link asked for, and opening somebody's link should not replace
 * what you had. Every change after that is, once it has settled for a moment, so that clicking
 * through a filter's conditions is one request rather than one per click. Stopping keeps a
 * change still waiting, since leaving a table straight after changing it is common.
 */
export default class UserTableViewKeeper {
  private table: TableRef | undefined;

  private known: string | undefined;

  private pending: ReturnType<typeof setTimeout> | undefined;

  private waiting: (() => void) | undefined;

  constructor(
    private keep: (table: TableRef, view: UserTableView) => Promise<unknown>,
  ) {}

  note(table: TableRef, view: UserTableView): void {
    const text = JSON.stringify(view);
    if (
      this.table?.databaseId !== table.databaseId ||
      this.table?.tableOid !== table.tableOid
    ) {
      this.flush();
      this.table = table;
      this.known = text;
      return;
    }
    if (text === this.known) return;
    this.known = text;
    this.cancel();
    this.waiting = () => {
      // Nothing to be done about a failure: the person is looking at the table, not at this.
      this.keep(table, view).catch(() => {});
    };
    this.pending = setTimeout(() => this.flush(), settleMs);
  }

  /** Keep a change still waiting now, rather than when it has settled */
  flush(): void {
    const { waiting } = this;
    this.cancel();
    waiting?.();
  }

  private cancel(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = undefined;
    this.waiting = undefined;
  }
}
