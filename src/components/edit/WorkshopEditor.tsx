import { lazyEditIsland } from '@/components/edit/lazyEditIsland';
import type { WorkshopEditorProps } from '@/components/edit/WorkshopEditorForm';

/**
 * PROJECTS and CLIENTS — whole records rather than patches, because nothing syncs
 * these. The form is the largest of the four and the one most worth not shipping
 * to a reader; it is fetched when edit mode goes on.
 */
export default lazyEditIsland<WorkshopEditorProps>(
  () => import('@/components/edit/WorkshopEditorForm'),
);
