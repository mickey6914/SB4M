import { useState } from 'react';
import { copyText, ideaAsText, NICHE_LABEL, useStartRunFromIdea, type Idea } from '../state/research';

// One product idea: why it is worth making, the image prompts to make it, and
// the Etsy copy to list it. Used on the research report and the idea board.

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <button
      type="button"
      className="btn btn-ghost btn-small"
      onClick={async () => {
        setDone((await copyText(text)) ? 'ok' : 'fail');
        setTimeout(() => setDone('idle'), 1500);
      }}
    >
      {done === 'ok' ? 'Copied' : done === 'fail' ? 'Select & copy' : label}
    </button>
  );
}

export function Swatches({ colors, size = 22 }: { colors: { name: string; hex: string }[]; size?: number }) {
  return (
    <div className="rs-swatches">
      {colors.map((c) => (
        <button
          key={c.name + c.hex}
          type="button"
          className="rs-swatch"
          title={`${c.name} ${c.hex} — click to copy`}
          style={{ background: c.hex, width: size, height: size }}
          onClick={() => copyText(c.hex)}
        />
      ))}
    </div>
  );
}

const DEMAND_TAG: Record<Idea['demand'], string> = {
  high: 'tag tag-accent',
  medium: 'tag tag-accent-2',
  emerging: 'tag tag-neutral',
};

export default function IdeaCard({
  idea,
  saved,
  onSave,
  children,
}: {
  idea: Idea;
  saved?: boolean;
  onSave?: () => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const startRun = useStartRunFromIdea();
  return (
    <article className="rs-idea">
      <div className="rs-idea-head">
        <div>
          <div className="card-kicker">{NICHE_LABEL[idea.niche]} · {idea.productType}</div>
          <h3 className="rs-idea-title">{idea.title}</h3>
        </div>
        <Swatches colors={idea.palette} />
      </div>

      <div className="rs-idea-tags">
        <span className={DEMAND_TAG[idea.demand]}>Demand: {idea.demand}</span>
        <span className="tag tag-neutral">Competition: {idea.competition}</span>
        {idea.styles.map((s) => (
          <span key={s} className="tag tag-outline">{s}</span>
        ))}
      </div>

      {idea.why && <p className="rs-idea-why">{idea.why}</p>}
      {idea.evidence.length > 0 && (
        <ul className="rs-evidence">
          {idea.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {idea.priceHint && <div className="rs-price-hint">Price: {idea.priceHint}</div>}

      <div className="rs-prompt">
        <div className="rs-prompt-head">
          <span className="field-label">Image prompt</span>
          <CopyButton text={idea.prompts.main} />
        </div>
        <p className="rs-prompt-text">{idea.prompts.main}</p>
      </div>

      {open && (
        <div className="rs-idea-more">
          {idea.prompts.variations.map((v, i) => (
            <div className="rs-prompt" key={i}>
              <div className="rs-prompt-head">
                <span className="field-label">Variation {i + 1}</span>
                <CopyButton text={v} />
              </div>
              <p className="rs-prompt-text">{v}</p>
            </div>
          ))}
          <div className="rs-prompt">
            <div className="rs-prompt-head">
              <span className="field-label">Negative prompt</span>
              <CopyButton text={idea.prompts.negative} />
            </div>
            <p className="rs-prompt-text rs-muted">{idea.prompts.negative}</p>
          </div>
          <div className="rs-prompt">
            <span className="field-label">Production specs</span>
            <ul className="rs-specs">
              {idea.specs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="rs-prompt">
            <div className="rs-prompt-head">
              <span className="field-label">Etsy title</span>
              <CopyButton text={idea.etsy.title} />
            </div>
            <p className="rs-prompt-text">{idea.etsy.title}</p>
            <div className="rs-prompt-head" style={{ marginTop: 8 }}>
              <span className="field-label">Etsy tags ({idea.etsy.tags.length})</span>
              <CopyButton text={idea.etsy.tags.join(', ')} />
            </div>
            <div className="rs-chips">
              {idea.etsy.tags.map((t) => (
                <span key={t} className="tag tag-neutral">{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {children}

      <div className="rs-idea-actions">
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen((o) => !o)}>
          {open ? 'Less' : 'Variations, specs & Etsy copy'}
        </button>
        <CopyButton text={ideaAsText(idea)} label="Copy all" />
        {onSave && (
          <button type="button" className="btn btn-secondary btn-small" disabled={saved} onClick={onSave}>
            {saved ? 'On idea board' : 'Save to board'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-small"
          title="Opens a new Pin-Post Studio run with this idea's product type, style and mockups — upload the finished art there"
          onClick={() => startRun(idea)}
        >
          Start a pin run
        </button>
      </div>
    </article>
  );
}
