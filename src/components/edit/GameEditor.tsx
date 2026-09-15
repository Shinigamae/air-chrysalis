import { lazyEditIsland } from '@/components/edit/lazyEditIsland';
import type { GameEditorProps } from '@/components/edit/GameEditorForm';

/**
 * rating, review, playStatus, current and entry status — the editorial half of a
 * game entry, which PSN cannot supply. The form is fetched when edit mode goes on.
 */
export default lazyEditIsland<GameEditorProps>(
  () => import('@/components/edit/GameEditorForm'),
);
