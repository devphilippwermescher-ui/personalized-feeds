import { useCallback, useMemo, useState } from 'react';
import { getPresetRange, startOfDay, type DateRange } from '../utils/date';
import { formatShortDate } from '../utils/format';

export interface DateRangePreset<TKey extends string> {
  key: TKey;
  label: string;
  days: number;
}

export type DateRangeBoundary = 'start' | 'end';

export interface DateRangeSelectionOptions<TKey extends string, TDefault extends string> {
  presets: Array<DateRangePreset<TKey>>;
  /** The key selected on first render, and the one `reset` returns to. */
  defaultRange: TDefault;
  /** Label shown for a default that is not one of the presets, e.g. "Total". */
  defaultRangeLabel?: string;
  customPresetDays?: number;
}

/**
 * Range selection state shared by the analytics surfaces.
 *
 * Each feature keeps its own defaults and its own meaning for a range; only
 * the selection mechanics and the calendar popover state live here.
 */
export function useDateRangeSelection<TKey extends string, TDefault extends string>({
  presets,
  defaultRange,
  defaultRangeLabel,
  customPresetDays = 30,
}: DateRangeSelectionOptions<TKey, TDefault>) {
  type ActiveKey = TKey | TDefault | 'custom';

  const [range, setRange] = useState<ActiveKey>(defaultRange as ActiveKey);
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange(customPresetDays));
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);
  const [activeCustomBoundary, setActiveCustomBoundary] = useState<DateRangeBoundary>('start');
  const [visibleMonth, setVisibleMonth] = useState(() => startOfDay(new Date()));

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.key === (range as TKey)),
    [presets, range]
  );

  const selectedDateRange = useMemo(() => {
    if (selectedPreset) return getPresetRange(selectedPreset.days);
    return range === 'custom' ? customRange : null;
  }, [customRange, range, selectedPreset]);

  const rangeLabel = useMemo(() => {
    if (selectedPreset) return `Last ${selectedPreset.label}`;
    if (range === 'custom') {
      return `${formatShortDate(customRange.start)} - ${formatShortDate(customRange.end)}`;
    }
    return defaultRangeLabel || defaultRange;
  }, [customRange, defaultRange, defaultRangeLabel, range, selectedPreset]);

  const selectPreset = useCallback((nextRange: TKey | TDefault) => {
    setRange(nextRange as ActiveKey);
    setIsCustomPickerOpen(false);
  }, []);

  const closeCustomPicker = useCallback(() => setIsCustomPickerOpen(false), []);

  const toggleCustomPicker = useCallback(() => {
    setRange('custom' as ActiveKey);
    setIsCustomPickerOpen((value) => !value);
  }, []);

  const updateCustomRange = useCallback((nextRange: DateRange) => {
    setCustomRange(nextRange);
    setRange('custom' as ActiveKey);
  }, []);

  const reset = useCallback(() => {
    const initialRange = getPresetRange(customPresetDays);
    setRange(defaultRange as ActiveKey);
    setCustomRange(initialRange);
    setVisibleMonth(startOfDay(initialRange.end));
    setActiveCustomBoundary('start');
    setIsCustomPickerOpen(false);
  }, [customPresetDays, defaultRange]);

  return {
    range,
    rangeLabel,
    selectedDateRange,
    customRange,
    isCustomPickerOpen,
    activeCustomBoundary,
    visibleMonth,
    selectPreset,
    toggleCustomPicker,
    closeCustomPicker,
    updateCustomRange,
    reset,
    setActiveCustomBoundary,
    setVisibleMonth,
  };
}
