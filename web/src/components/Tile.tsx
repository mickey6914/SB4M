import type { ReactNode } from 'react';
import { CheckIcon, ImageIcon } from './icons';

// Selectable media tile shared by the hero and scenes steps: 6px padding
// inside a 2px border, accent when selected with a 22px check badge,
// accent-400 border on hover. Media is a placeholder ground until listing
// ingestion (increment 3) supplies real images.

type Props = {
  selected: boolean;
  onSelect: () => void;
  aspect: '1 / 1' | '4 / 3';
  media?: ReactNode;
  mediaLabel: string;
  caption: string;
};

export default function Tile({ selected, onSelect, aspect, media, mediaLabel, caption }: Props) {
  return (
    <div
      className={selected ? 'tile selected' : 'tile'}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="tile-media" style={{ aspectRatio: aspect }}>
        {media ?? (
          <>
            <ImageIcon size={24} />
            <span>{mediaLabel}</span>
          </>
        )}
      </div>
      {selected && (
        <span className="tile-check">
          <CheckIcon size={14} />
        </span>
      )}
      <div className={selected ? 'tile-caption selected' : 'tile-caption'}>{caption}</div>
    </div>
  );
}
