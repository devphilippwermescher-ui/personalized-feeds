import { useId } from 'react';
import { HiOutlineInformationCircle } from 'react-icons/hi2';

interface InfoTooltipProps {
  label: string;
  content: string;
  placement?: 'left' | 'right';
}

export function InfoTooltip({ label, content, placement = 'left' }: InfoTooltipProps) {
  const tooltipId = useId();

  return (
    <span className={`profile-analytics-info-tooltip-wrap profile-analytics-info-tooltip-wrap--${placement}`}>
      <button
        className="profile-analytics-info-trigger"
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <HiOutlineInformationCircle />
      </button>
      <span id={tooltipId} className="profile-analytics-info-tooltip" role="tooltip">
        {content}
      </span>
    </span>
  );
}
