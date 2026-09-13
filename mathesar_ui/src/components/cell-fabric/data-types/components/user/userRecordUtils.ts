import type {
  RecordsSummaryListResponse,
  SummarizedRecordReference,
} from '@mathesar/api/rpc/_common/commonTypes';
import type { User } from '@mathesar/api/rpc/users';
import AsyncStore from '@mathesar/stores/AsyncStore';
import type { RowSeekerRecordStore } from '@mathesar/systems/row-seeker/RowSeekerController';
import {
  type UserDisplayField,
  byOwnerThenName,
  getUserPickerLabel,
} from '@mathesar/utils/userUtils';

export function convertUsersToRecords(
  users: User[],
  userDisplayField: UserDisplayField,
  searchQuery?: string,
  limit?: number,
  offset?: number,
  viewerId?: string,
): RecordsSummaryListResponse {
  // Each person followed by the agents they set going, so that an agent is read beside
  // whoever is answerable for it rather than wherever its name happens to sort.
  let filteredUsers = byOwnerThenName(users);
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredUsers = filteredUsers.filter(
      (user) =>
        user.username?.toLowerCase().includes(query) ||
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        // Searching an owner's name finds the agents they set going, which is how you
        // look for "one of Bligh's" without knowing what he called it.
        user.display_name?.toLowerCase().includes(query),
    );
  }

  const totalCount = filteredUsers.length;
  const start = offset ?? 0;
  const end = limit ? start + limit : filteredUsers.length;
  const paginatedUsers = filteredUsers.slice(start, end);

  const results: SummarizedRecordReference[] = paginatedUsers.map((user) => ({
    key: user.id,
    summary: getUserPickerLabel(user, userDisplayField, viewerId),
  }));

  return {
    results,
    count: totalCount,
  };
}

/**
 * Create an AsyncStore-based record store for the row seeker that serves
 * user records from the in-memory users list.
 */
export function createUserRecordStore(
  users: User[],
  userDisplayField: UserDisplayField,
  viewerId?: string,
): RowSeekerRecordStore {
  return new AsyncStore<
    {
      limit?: number | null;
      offset?: number | null;
      search?: string | null;
    },
    RecordsSummaryListResponse
  >(async (params) => {
    const { limit = null, offset = null, search = null } = params;
    return convertUsersToRecords(
      users,
      userDisplayField,
      search ?? undefined,
      limit ?? undefined,
      offset ?? undefined,
      viewerId,
    );
  });
}
