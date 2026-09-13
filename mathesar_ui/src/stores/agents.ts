import { readable } from 'svelte/store';

import { api } from '@mathesar/api/rpc';

/**
 * Whether this installation can let an agent in with a certificate.
 *
 * Everything that hands an agent work assumes it can, so where it cannot -- any installation
 * without a certificate gate -- those offers are not made at all rather than made and then
 * leading nowhere. Asked when something first wants to know, and taken as no if asking fails.
 */
export const canIssueAgentCertificates = readable(false, (set) => {
  api.users.agents
    .can_issue_certificates()
    .run()
    .then(set)
    .catch(() => set(false));
});
