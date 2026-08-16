import { useCallback, useMemo, useState } from 'react';
import { getPresetRange, startOfDay, type DateRange } from '../../../utils/date';
import { formatShortDate } from '../../../utils/format';
import { TIME_RANGES } from '../constants';
import type { ActiveRangeKey, DateRangeBoundary, TimeRangeKey } from '../types';

export function useAnalyticsDateRange() {
  const [range, setRange] = useState<ActiveRangeKey>('total');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange(30));
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);
  const [activeCustomBoundary, setActiveCustomBoundary] = useState<DateRangeBoundary>('start');
  const [visibleMonth, setVisibleMonth] = useState(() => startOfDay(new Date()));

  const selectedDateRange = useMemo(() => {
    if (range === 'total') return null;
    const preset = TIME_RANGES.find((item) => item.key === range);
    return preset ? getPresetRange(preset.days) : customRange;
  }, [customRange, range]);

  const rangeLabel = useMemo(() => {
    if (range === 'total') return 'Total';
    const preset = TIME_RANGES.find((item) => item.key === range);
    return preset
      ? `Last ${preset.label}`
      : `${formatShortDate(customRange.start)} - ${formatShortDate(customRange.end)}`;
  }, [customRange, range]);

  function selectPreset(nextRange: TimeRangeKey) {
    setRange(nextRange);
    setIsCustomPickerOpen(false);
  }

  const closeCustomPicker = useCallback(() => {
    setIsCustomPickerOpen(false);
  }, []);

  function toggleCustomPicker() {
    setRange('custom');
    setIsCustomPickerOpen((value) => !value);
  }

  function updateCustomRange(nextRange: DateRange) {
    setCustomRange(nextRange);
    setRange('custom');
  }

  function reset() {
    const defaultRange = getPresetRange(30);
    setRange('total');
    setCustomRange(defaultRange);
    setVisibleMonth(startOfDay(defaultRange.end));
    setActiveCustomBoundary('start');
    setIsCustomPickerOpen(false);
  }

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
