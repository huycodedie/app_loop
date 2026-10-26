import { WatchFolderConfig } from '@shared/types';
import { parseTimeToSeconds } from './formatters';

type WatchFolderFormValues = Pick<WatchFolderConfig,
  'folderPath' | 'outputFolder' | 'durationLimitEnabled' | 'durationLimitSeconds' |
  'durationMode' | 'maxOvershootSeconds'>;

/** Use the visible form values when saving both new and edited watch rules. */
export function serializeWatchFolderForm<T extends WatchFolderFormValues>(values: T, durationInput: string): T {
  const duration = parseTimeToSeconds(durationInput);
  if (values.durationLimitEnabled && (duration === null || duration <= 0)) {
    throw new Error('Vui lòng nhập thời lượng lớn hơn 0.');
  }
  const folderPath = values.folderPath.trim();
  const durationMode = values.durationMode ?? 'EXACT';
  return {
    ...values,
    folderPath,
    outputFolder: values.outputFolder.trim() || folderPath,
    durationLimitSeconds: values.durationLimitEnabled ? duration : null,
    durationMode,
    maxOvershootSeconds: durationMode === 'MINIMUM' ? values.maxOvershootSeconds ?? null : null,
  };
}
