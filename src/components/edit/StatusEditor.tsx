import type { SiteStatus } from '@/lib/api';
import { lazyEditIsland } from '@/components/edit/lazyEditIsland';

/**
 * BUILDING and NEXT BUILD — the homepage's CURRENT STATUS panel, and the only
 * genuinely live fields on the site. The form is in StatusEditorForm.tsx and is
 * fetched when edit mode goes on; see lazyEditIsland for why.
 */
export default lazyEditIsland<SiteStatus>(
  () => import('@/components/edit/StatusEditorForm'),
);
